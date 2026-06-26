import { NextResponse, type NextRequest } from "next/server";

import { isAdmin } from "@/lib/auth";
import { ROUND_ORDER, type RoundKey } from "@/lib/rounds";
import { createServiceClient } from "@/lib/supabase/server";
import {
  matchClosed,
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

// 시작 시간 입력값(ISO 문자열 또는 빈값/널)을 검증해 ISO 문자열|null 로 정규화.
// 잘못된 형식이면 undefined 를 돌려 호출부에서 거부하게 한다.
function normalizeStartsAt(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

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

  // ── 셋업: 32강 한 경기(슬롯) 저장 — 두 팀 + (선택) 시작 시간 ──────────────
  // 16경기를 한 번에가 아니라 경기마다 따로 저장한다. 슬롯 단위 upsert.
  if (action === "setupMatch") {
    const slot = body?.slot;
    if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 15) {
      return NextResponse.json({ error: "잘못된 경기 번호입니다." }, { status: 400 });
    }
    const teamA = typeof body?.teamA === "string" ? body.teamA.trim() : "";
    const teamB = typeof body?.teamB === "string" ? body.teamB.trim() : "";
    if (!teamA || !teamB) {
      return NextResponse.json({ error: "두 팀 이름을 모두 입력하세요." }, { status: 400 });
    }
    if (teamA === teamB) {
      return NextResponse.json({ error: "같은 팀끼리 맞붙을 수 없습니다." }, { status: 400 });
    }
    const startsAt = normalizeStartsAt(body?.startsAt);
    if (startsAt === undefined) {
      return NextResponse.json({ error: "시작 시간 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const existing = (await fetchMatches(sb)).filter((m) => m.round === "R32");
    const mineRow = existing.find((m) => m.bracket_slot === slot);
    // 이미 시작됐거나 결과가 들어간 경기는 대진 변경 불가
    if (mineRow && (mineRow.winner || matchClosed(mineRow, Date.now()))) {
      return NextResponse.json(
        { error: "이미 시작되었거나 결과가 입력된 경기는 수정할 수 없습니다." },
        { status: 400 }
      );
    }
    // 다른 슬롯에 이미 쓰인 팀 이름과 중복 금지
    const usedElsewhere = new Set<string>();
    for (const m of existing) {
      if (m.bracket_slot === slot) continue;
      if (m.team_a) usedElsewhere.add(m.team_a);
      if (m.team_b) usedElsewhere.add(m.team_b);
    }
    if (usedElsewhere.has(teamA) || usedElsewhere.has(teamB)) {
      return NextResponse.json(
        { error: "다른 경기에 이미 쓰인 팀 이름입니다." },
        { status: 400 }
      );
    }

    const { error } = await sb.from("matches").upsert(
      { round: "R32", bracket_slot: slot, team_a: teamA, team_b: teamB, starts_at: startsAt },
      { onConflict: "round,bracket_slot" }
    );
    if (error) {
      console.error("setupMatch 실패", error);
      return NextResponse.json(
        { error: `경기 저장에 실패했습니다. (${error.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }

    // 다음 라운드 골격이 없으면 만들어 둔다(최초 1회). 진행·표시에 필요.
    const haveRounds = new Set((await fetchMatches(sb)).map((m) => m.round));
    const skeleton: Pick<
      Match,
      "round" | "bracket_slot" | "team_a" | "team_b" | "starts_at"
    >[] = [];
    for (const round of ["R16", "R8", "SF", "FINAL", "THIRD"] as RoundKey[]) {
      if (haveRounds.has(round)) continue;
      for (let s = 0; s < ROUND_SLOT_COUNT[round]; s++) {
        skeleton.push({ round, bracket_slot: s, team_a: null, team_b: null, starts_at: null });
      }
    }
    if (skeleton.length > 0) {
      const { error: skErr } = await sb.from("matches").insert(skeleton);
      if (skErr) {
        console.error("setupMatch 골격 생성 실패", skErr);
        return NextResponse.json(
          { error: `다음 라운드 생성에 실패했습니다. (${skErr.message}) — /api/health 로 점검하세요.` },
          { status: 500 }
        );
      }
    }

    // 세팅된 경기는 곧바로 예측 가능 → 앱을 열어둔다(최초 저장 시 setup_done=true).
    const { data: setRow } = await sb
      .from("settings")
      .select("setup_done,current_open_round")
      .eq("id", 1)
      .maybeSingle();
    if (!setRow?.setup_done || !setRow?.current_open_round) {
      const { error: settingsErr } = await sb.from("settings").upsert(
        { id: 1, setup_done: true, current_open_round: setRow?.current_open_round ?? "R32" },
        { onConflict: "id" }
      );
      if (settingsErr) {
        console.error("setupMatch 설정 저장 실패", settingsErr);
        return NextResponse.json(
          { error: `셋업 상태 저장에 실패했습니다. (${settingsErr.message}) — /api/health 로 점검하세요.` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── 대회 초기화: 모든 예측·경기 삭제 + 셋업 미완료 상태로 (경기별 재입력) ──
  if (action === "reset") {
    const { error: delPredErr } = await sb.from("predictions").delete().neq("id", ZERO_UUID);
    if (delPredErr) {
      console.error("reset 예측 초기화 실패", delPredErr);
      return NextResponse.json(
        { error: `예측 초기화에 실패했습니다. (${delPredErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }
    const { error: delMatchErr } = await sb.from("matches").delete().neq("id", ZERO_UUID);
    if (delMatchErr) {
      console.error("reset 대진 초기화 실패", delMatchErr);
      return NextResponse.json(
        { error: `대진 초기화에 실패했습니다. (${delMatchErr.message}) — /api/health 로 점검하세요.` },
        { status: 500 }
      );
    }
    const { error: settingsErr } = await sb
      .from("settings")
      .upsert({ id: 1, setup_done: false, current_open_round: null }, { onConflict: "id" });
    if (settingsErr) {
      console.error("reset 설정 저장 실패", settingsErr);
      return NextResponse.json(
        { error: `초기화 상태 저장에 실패했습니다. (${settingsErr.message}) — /api/health 로 점검하세요.` },
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

  // ── 경기 시작 시간 설정 (한 경기) ──────────────────────────────────
  if (action === "schedule") {
    const matchId = body?.matchId;
    if (typeof matchId !== "string") {
      return NextResponse.json({ error: "경기를 확인하세요." }, { status: 400 });
    }
    const startsAt = normalizeStartsAt(body?.startsAt);
    if (startsAt === undefined) {
      return NextResponse.json({ error: "시작 시간 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const { error } = await sb
      .from("matches")
      .update({ starts_at: startsAt })
      .eq("id", matchId);
    if (error) {
      console.error("schedule 실패", error);
      return NextResponse.json({ error: "시작 시간 저장에 실패했습니다." }, { status: 500 });
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
    if (!matchClosed(match, Date.now()))
      return NextResponse.json(
        { error: "아직 예측 마감 전입니다. 시작 시간이 지났거나 강제 마감한 뒤 결과를 입력하세요." },
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
          .update({ team_a: null, team_b: null, winner: null, is_locked: false, starts_at: null })
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
