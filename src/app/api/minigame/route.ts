import { NextResponse, type NextRequest } from "next/server";

import { getParticipantSession } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { matchClosed } from "@/lib/tournament";
import type { Match, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const isScore = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 50;

// 미니게임 스코어 — 입력 후 "제출"하면 저장, "회수"하면 삭제.
// 둘 다 경기 시작 시간(마감) 전에만 가능.
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const sb = createServiceClient();

  // 현재 미니게임 대상 경기 확인
  const { data: settingsData } = await sb
    .from("settings")
    .select("mini_match_id")
    .eq("id", 1)
    .maybeSingle();
  const matchId = (settingsData as Pick<Settings, "mini_match_id"> | null)?.mini_match_id ?? null;
  if (!matchId) {
    return NextResponse.json({ error: "진행 중인 미니게임이 없습니다." }, { status: 400 });
  }

  const { data: matchData } = await sb.from("matches").select("*").eq("id", matchId).maybeSingle();
  const match = matchData as Match | null;
  if (!match || !match.team_a || !match.team_b) {
    return NextResponse.json({ error: "미니게임 경기를 찾을 수 없습니다." }, { status: 404 });
  }
  if (matchClosed(match, Date.now())) {
    return NextResponse.json({ error: "경기가 시작되어 마감되었습니다." }, { status: 403 });
  }

  // ── 제출 회수: 내 추측 삭제 ──────────────────────────────────────
  if (action === "withdraw") {
    const { error } = await sb
      .from("mini_predictions")
      .delete()
      .eq("participant_id", session.id)
      .eq("match_id", matchId);
    if (error) {
      console.error("minigame withdraw 실패", error);
      return NextResponse.json({ error: "회수에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── 제출: 스코어 저장 ────────────────────────────────────────────
  if (action === "submit") {
    const a = body?.a;
    const b = body?.b;
    if (!isScore(a) || !isScore(b)) {
      return NextResponse.json({ error: "스코어를 확인하세요 (0~50)." }, { status: 400 });
    }
    const { error } = await sb.from("mini_predictions").upsert(
      { participant_id: session.id, match_id: matchId, a_score: a, b_score: b },
      { onConflict: "participant_id,match_id" }
    );
    if (error) {
      console.error("minigame submit 실패", error);
      return NextResponse.json({ error: "제출에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
}
