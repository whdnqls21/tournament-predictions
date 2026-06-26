import { NextResponse, type NextRequest } from "next/server";

import { isAdmin } from "@/lib/auth";
import { ROUND_ORDER, type RoundKey } from "@/lib/rounds";
import { createServiceClient } from "@/lib/supabase/server";
import {
  nextStageAssignments,
  roundFullyResulted,
  ROUND_SLOT_COUNT,
  STAGE_ROUNDS,
  stageOfRound,
} from "@/lib/tournament";
import { hashPin, isValidPin } from "@/lib/pin";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const NON_FINAL_ROUNDS: RoundKey[] = ["R32", "R16", "R8", "SF"];

async function fetchMatches(sb: ReturnType<typeof createServiceClient>): Promise<Match[]> {
  const { data } = await sb.from("matches").select("*");
  return ((data ?? []) as Match[]).sort(
    (a, b) =>
      ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) ||
      a.bracket_slot - b.bracket_slot
  );
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const sb = createServiceClient();

  // ── 셋업: 32강 16경기 대진 배치 + (선택) 참가자 PIN 지정 ──────────────
  if (action === "setup") {
    const matchups = body?.matchups;
    const force = body?.force === true;

    if (!Array.isArray(matchups) || matchups.length !== 16) {
      return NextResponse.json({ error: "32강 16경기를 모두 입력하세요." }, { status: 400 });
    }
    const teams: string[] = [];
    for (const pair of matchups) {
      const a = typeof pair?.[0] === "string" ? pair[0].trim() : "";
      const b = typeof pair?.[1] === "string" ? pair[1].trim() : "";
      if (!a || !b) {
        return NextResponse.json({ error: "빈 팀 이름이 있습니다." }, { status: 400 });
      }
      teams.push(a, b);
    }
    if (new Set(teams).size !== 32) {
      return NextResponse.json({ error: "팀 이름은 32개가 모두 달라야 합니다." }, { status: 400 });
    }

    // 진행 중(결과 입력됨)인데 force 없으면 거부 (예측·결과 날아감 방지)
    const existing = await fetchMatches(sb);
    if (existing.some((m) => m.winner) && !force) {
      return NextResponse.json(
        { error: "이미 결과가 입력된 대회입니다. 다시 셋업하면 모두 초기화됩니다. (force 필요)" },
        { status: 409 }
      );
    }

    // 전체 초기화 후 재생성
    const { error: delPredErr } = await sb.from("predictions").delete().neq("id", ZERO_UUID);
    if (delPredErr) {
      console.error("setup 예측 초기화 실패", delPredErr);
      return NextResponse.json(
        { error: `기존 예측 초기화에 실패했습니다. (${delPredErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }
    const { error: delMatchErr } = await sb.from("matches").delete().neq("id", ZERO_UUID);
    if (delMatchErr) {
      console.error("setup 대진 초기화 실패", delMatchErr);
      return NextResponse.json(
        { error: `기존 대진 초기화에 실패했습니다. (${delMatchErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }

    const rows: Pick<Match, "round" | "bracket_slot" | "team_a" | "team_b">[] = [];
    matchups.forEach((pair: [string, string], slot: number) => {
      rows.push({
        round: "R32",
        bracket_slot: slot,
        team_a: pair[0].trim(),
        team_b: pair[1].trim(),
      });
    });
    for (const round of ["R16", "R8", "SF", "FINAL", "THIRD"] as RoundKey[]) {
      for (let slot = 0; slot < ROUND_SLOT_COUNT[round]; slot++) {
        rows.push({ round, bracket_slot: slot, team_a: null, team_b: null });
      }
    }
    const { error: insErr } = await sb.from("matches").insert(rows);
    if (insErr) {
      console.error("setup insert 실패", insErr);
      return NextResponse.json(
        { error: `대진 생성에 실패했습니다. (${insErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }

    // 참가자 PIN (선택)
    const pins = body?.pins;
    if (pins && typeof pins === "object") {
      for (const [participantId, pin] of Object.entries(pins)) {
        if (isValidPin(pin)) {
          const hash = await hashPin(pin);
          await sb.from("participants").update({ pin_hash: hash }).eq("id", participantId);
        }
      }
    }

    // 셋업 완료 표시 — 이 쓰기가 실패하면 setup_done 이 false 로 남아
    // 관리자 화면이 다시 셋업 폼을 보여주므로("저장이 안 된" 것처럼 보임),
    // 반드시 에러를 확인해 사용자에게 알린다.
    const { error: settingsErr } = await sb
      .from("settings")
      .upsert({ id: 1, setup_done: true, current_open_round: "R32" }, { onConflict: "id" });
    if (settingsErr) {
      console.error("setup 설정 저장 실패", settingsErr);
      return NextResponse.json(
        { error: `셋업 상태 저장에 실패했습니다. (${settingsErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // ── 참가자 PIN 지정/재설정 ─────────────────────────────────────────
  if (action === "pin") {
    const participantId = body?.participantId;
    const pin = body?.pin;
    if (typeof participantId !== "string" || !isValidPin(pin)) {
      return NextResponse.json({ error: "참가자와 4자리 PIN을 확인하세요." }, { status: 400 });
    }
    const hash = await hashPin(pin);
    const { error } = await sb
      .from("participants")
      .update({ pin_hash: hash })
      .eq("id", participantId);
    if (error) {
      console.error("PIN 설정 실패", error);
      return NextResponse.json({ error: "PIN 설정에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── 강제 마감 (라운드 잠금) ────────────────────────────────────────
  if (action === "lock") {
    const round = body?.round;
    if (!ROUND_ORDER.includes(round)) {
      return NextResponse.json({ error: "잘못된 라운드입니다." }, { status: 400 });
    }
    const { data: ms } = await sb.from("matches").select("id,team_a,team_b").eq("round", round);
    const matches = (ms ?? []) as Pick<Match, "id" | "team_a" | "team_b">[];
    if (matches.length === 0 || matches.some((m) => !m.team_a || !m.team_b)) {
      return NextResponse.json({ error: "아직 열리지 않은 라운드입니다." }, { status: 400 });
    }
    const { error } = await sb
      .from("matches")
      .update({ is_locked: true })
      .in("id", matches.map((m) => m.id));
    if (error) {
      console.error("lock 실패", error);
      return NextResponse.json({ error: "마감에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── 결과 입력 (+ 라운드 완료 시 다음 단계 자동 생성) ─────────────────
  if (action === "result") {
    const matchId = body?.matchId;
    const winner = body?.winner;
    if (typeof matchId !== "string" || typeof winner !== "string") {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const { data: matchData } = await sb
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    const match = matchData as Match | null;
    if (!match) return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 });
    if (!match.team_a || !match.team_b)
      return NextResponse.json({ error: "팀이 아직 정해지지 않았습니다." }, { status: 400 });
    if (winner !== match.team_a && winner !== match.team_b)
      return NextResponse.json({ error: "두 팀 중 하나만 선택할 수 있습니다." }, { status: 400 });
    if (!match.is_locked)
      return NextResponse.json(
        { error: "먼저 이 라운드를 마감(잠금)한 뒤 결과를 입력하세요." },
        { status: 400 }
      );

    const { error: upErr } = await sb.from("matches").update({ winner }).eq("id", matchId);
    if (upErr) {
      console.error("result 실패", upErr);
      return NextResponse.json({ error: "결과 입력에 실패했습니다." }, { status: 500 });
    }

    // 라운드가 모두 끝났으면 다음 단계 팀 자동 배정
    const round = match.round;
    const matches = await fetchMatches(sb);
    if (roundFullyResulted(matches, round)) {
      const assignments = nextStageAssignments(matches, round);
      for (const a of assignments) {
        await sb
          .from("matches")
          .update({ team_a: a.team_a, team_b: a.team_b })
          .eq("id", a.matchId);
      }
      if (NON_FINAL_ROUNDS.includes(round)) {
        const nextOpen: RoundKey =
          round === "R32" ? "R16" : round === "R16" ? "R8" : round === "R8" ? "SF" : "FINAL";
        await sb.from("settings").update({ current_open_round: nextOpen }).eq("id", 1);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── 되돌리기: 가장 최근에 결과가 들어간 라운드만 (다음 단계 초기화) ──────
  if (action === "undo") {
    const matches = await fetchMatches(sb);
    const resultedStages = matches
      .filter((m) => m.winner)
      .map((m) => stageOfRound(m.round));
    if (resultedStages.length === 0) {
      return NextResponse.json({ error: "되돌릴 결과가 없습니다." }, { status: 400 });
    }
    const targetStage = Math.max(...resultedStages);
    const stageRounds = STAGE_ROUNDS[targetStage];

    // 1) 해당 단계 결과 제거
    const stageMatchIds = matches
      .filter((m) => stageRounds.includes(m.round))
      .map((m) => m.id);
    await sb.from("matches").update({ winner: null }).in("id", stageMatchIds);

    // 2) 다음 단계 초기화 (팀/결과/마감 리셋 + 예측 삭제)
    const nextStage = STAGE_ROUNDS[targetStage + 1];
    if (nextStage) {
      const nextMatchIds = matches
        .filter((m) => nextStage.includes(m.round))
        .map((m) => m.id);
      if (nextMatchIds.length > 0) {
        await sb.from("predictions").delete().in("match_id", nextMatchIds);
        await sb
          .from("matches")
          .update({ team_a: null, team_b: null, winner: null, is_locked: false })
          .in("id", nextMatchIds);
      }
    }

    await sb
      .from("settings")
      .update({ current_open_round: stageRounds[0] })
      .eq("id", 1);

    return NextResponse.json({ ok: true, undoneStage: targetStage });
  }

  return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
}
