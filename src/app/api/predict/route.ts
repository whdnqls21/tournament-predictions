import { NextResponse, type NextRequest } from "next/server";

import { getParticipantSession } from "@/lib/auth";
import { type RoundKey } from "@/lib/rounds";
import { createServiceClient } from "@/lib/supabase/server";
import type { Match, Participant, Prediction } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROUND_KEYS: RoundKey[] = ["R32", "R16", "R8", "SF", "FINAL", "THIRD"];
const isRoundKey = (v: unknown): v is RoundKey =>
  typeof v === "string" && (ROUND_KEYS as string[]).includes(v);

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const sb = createServiceClient();

  // ── 한 경기 픽 (확정 전, 마감 전에만) ──────────────────────────────
  if (action === "pick") {
    const matchId = body?.matchId;
    const pickedTeam = body?.pickedTeam;
    if (typeof matchId !== "string" || typeof pickedTeam !== "string") {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { data: matchData } = await sb
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    const match = matchData as Match | null;
    if (!match) return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 });
    if (match.is_locked)
      return NextResponse.json({ error: "마감된 경기는 수정할 수 없습니다." }, { status: 403 });
    if (!match.team_a || !match.team_b)
      return NextResponse.json({ error: "아직 열리지 않은 경기입니다." }, { status: 400 });
    if (pickedTeam !== match.team_a && pickedTeam !== match.team_b)
      return NextResponse.json({ error: "두 팀 중 하나만 선택할 수 있습니다." }, { status: 400 });

    const { data: existingData } = await sb
      .from("predictions")
      .select("id,confirmed")
      .eq("participant_id", session.id)
      .eq("match_id", matchId)
      .maybeSingle();
    const existing = existingData as Pick<Prediction, "id" | "confirmed"> | null;

    if (existing?.confirmed) {
      return NextResponse.json(
        { error: "확정을 취소한 뒤 수정할 수 있어요." },
        { status: 400 }
      );
    }

    const { error } = await sb.from("predictions").upsert(
      {
        participant_id: session.id,
        match_id: matchId,
        picked_team: pickedTeam,
        confirmed: false,
      },
      { onConflict: "participant_id,match_id" }
    );
    if (error) {
      console.error("pick upsert 실패", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── 라운드 확정 (모든 경기 선택 필요) + 전원 확정 시 자동 마감 ──────────
  if (action === "confirm") {
    const round = body?.round;
    if (!isRoundKey(round))
      return NextResponse.json({ error: "잘못된 라운드입니다." }, { status: 400 });

    const { data: ms } = await sb.from("matches").select("*").eq("round", round);
    const matches = (ms ?? []) as Match[];
    if (matches.length === 0)
      return NextResponse.json({ error: "라운드 경기가 없습니다." }, { status: 400 });
    if (matches.some((m) => !m.team_a || !m.team_b))
      return NextResponse.json({ error: "아직 열리지 않은 라운드입니다." }, { status: 400 });
    if (matches.some((m) => m.is_locked))
      return NextResponse.json({ error: "이미 마감된 라운드입니다." }, { status: 400 });

    const matchIds = matches.map((m) => m.id);
    const { data: mine } = await sb
      .from("predictions")
      .select("match_id")
      .eq("participant_id", session.id)
      .in("match_id", matchIds);
    const picked = new Set((mine ?? []).map((p) => (p as { match_id: string }).match_id));
    if (picked.size < matches.length) {
      return NextResponse.json(
        { error: "모든 경기를 선택해야 확정할 수 있어요." },
        { status: 400 }
      );
    }

    const { error: confErr } = await sb
      .from("predictions")
      .update({ confirmed: true })
      .eq("participant_id", session.id)
      .in("match_id", matchIds);
    if (confErr) {
      console.error("confirm 실패", confErr);
      return NextResponse.json({ error: "확정에 실패했습니다." }, { status: 500 });
    }

    // 전원 확정 → 자동 마감 (§2)
    const [{ data: parts }, { data: allPreds }] = await Promise.all([
      sb.from("participants").select("id"),
      sb
        .from("predictions")
        .select("participant_id,match_id,confirmed")
        .in("match_id", matchIds),
    ]);
    const participants = (parts ?? []) as Pick<Participant, "id">[];
    const preds = (allPreds ?? []) as Pick<
      Prediction,
      "participant_id" | "match_id" | "confirmed"
    >[];
    const allConfirmed =
      participants.length > 0 &&
      participants.every((p) => {
        const c = preds.filter((x) => x.participant_id === p.id && x.confirmed).length;
        return c === matches.length;
      });

    let locked = false;
    if (allConfirmed) {
      const { error: lockErr } = await sb
        .from("matches")
        .update({ is_locked: true })
        .in("id", matchIds);
      if (!lockErr) locked = true;
    }

    return NextResponse.json({ ok: true, locked });
  }

  // ── 확정 취소 (마감 전에만) ────────────────────────────────────────
  if (action === "unconfirm") {
    const round = body?.round;
    if (!isRoundKey(round))
      return NextResponse.json({ error: "잘못된 라운드입니다." }, { status: 400 });

    const { data: ms } = await sb.from("matches").select("id,is_locked").eq("round", round);
    const matches = (ms ?? []) as Pick<Match, "id" | "is_locked">[];
    if (matches.length === 0)
      return NextResponse.json({ error: "라운드 경기가 없습니다." }, { status: 400 });
    if (matches.some((m) => m.is_locked))
      return NextResponse.json({ error: "마감되어 취소할 수 없습니다." }, { status: 400 });

    const matchIds = matches.map((m) => m.id);
    const { error } = await sb
      .from("predictions")
      .update({ confirmed: false })
      .eq("participant_id", session.id)
      .in("match_id", matchIds);
    if (error) {
      console.error("unconfirm 실패", error);
      return NextResponse.json({ error: "취소에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
}
