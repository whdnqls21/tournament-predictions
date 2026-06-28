import "server-only";

import { getParticipantSession, isAdmin } from "./auth";
import { ROUND_ORDER, type RoundKey } from "./rounds";
import { createServiceClient } from "./supabase/server";
import {
  activeRounds,
  activeStage,
  computeGifts,
  computeStandings,
  matchClosed,
  matchesInRound,
  type GiftEdge,
  type Standing,
} from "./tournament";
import type { Match, MiniPrediction, Participant, Prediction, Settings } from "./types";

// ── 미니게임(스코어 맞히기) 뷰 ──────────────────────────────────────────
export interface MiniGameView {
  matchId: string;
  teamA: string;
  teamB: string;
  startsAt: string | null;
  closed: boolean;
  myGuess: { a: number; b: number } | null;
  savedBy: string[]; // 추측 저장한 참가자 id (마감 전 현황)
  guesses: { participantId: string; name: string; a: number; b: number }[]; // 마감 후(또는 관리자) 공개
  actual: { a: number; b: number } | null; // 관리자가 입력한 실제 스코어
  winners: string[]; // 정확히 맞힌 참가자 id (실제 스코어 입력 후)
}

function buildMiniGame(
  settings: Settings | null,
  matches: Match[],
  miniPreds: MiniPrediction[],
  nameById: Map<string, string>,
  now: number,
  opts: { forAdmin: boolean; sessionId?: string | null }
): MiniGameView | null {
  const matchId = settings?.mini_match_id ?? null;
  if (!matchId) return null;
  const m = matches.find((x) => x.id === matchId);
  if (!m || !m.team_a || !m.team_b) return null; // 대상 경기가 없거나 팀 미정이면 비활성

  const closed = matchClosed(m, now);
  const preds = miniPreds.filter((p) => p.match_id === matchId);
  const actual =
    settings?.mini_home_score != null && settings?.mini_away_score != null
      ? { a: settings.mini_home_score, b: settings.mini_away_score }
      : null;

  const reveal = opts.forAdmin || closed;
  const guesses = reveal
    ? preds.map((p) => ({
        participantId: p.participant_id,
        name: nameById.get(p.participant_id) ?? "",
        a: p.a_score,
        b: p.b_score,
      }))
    : [];
  const mine = opts.sessionId ? preds.find((p) => p.participant_id === opts.sessionId) : undefined;

  return {
    matchId,
    teamA: m.team_a,
    teamB: m.team_b,
    startsAt: m.starts_at,
    closed,
    myGuess: mine ? { a: mine.a_score, b: mine.b_score } : null,
    savedBy: preds.map((p) => p.participant_id),
    guesses,
    actual,
    winners: actual
      ? preds.filter((p) => p.a_score === actual.a && p.b_score === actual.b).map((p) => p.participant_id)
      : [],
  };
}

interface RawData {
  participants: Participant[];
  settings: Settings | null;
  matches: Match[];
  predictions: Prediction[];
  miniPreds: MiniPrediction[];
}

async function fetchAll(): Promise<RawData> {
  const sb = createServiceClient();
  const [pRes, sRes, mRes, prRes, mpRes] = await Promise.all([
    sb.from("participants").select("id,name,display_order,created_at").order("display_order"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("matches").select("*"),
    sb.from("predictions").select("*"),
    sb.from("mini_predictions").select("*"),
  ]);
  return {
    participants: (pRes.data ?? []) as Participant[],
    settings: (sRes.data ?? null) as Settings | null,
    matches: ((mRes.data ?? []) as Match[]).sort(
      (a, b) =>
        ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) ||
        a.bracket_slot - b.bracket_slot
    ),
    predictions: (prRes.data ?? []) as Prediction[],
    miniPreds: (mpRes.data ?? []) as MiniPrediction[],
  };
}

// 라운드별·참가자별 "확정했는지" 여부. 마감 전에도 항상 공개 (§2 — 누가 확정했는지만 표시).
function confirmByRound(
  participants: Participant[],
  matches: Match[],
  predictions: Prediction[]
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const round of ROUND_ORDER) {
    const ms = matchesInRound(matches, round);
    const per: Record<string, boolean> = {};
    for (const part of participants) {
      const myConfirmed = predictions.filter(
        (p) => p.participant_id === part.id && p.confirmed && ms.some((m) => m.id === p.match_id)
      ).length;
      per[part.id] = ms.length > 0 && myConfirmed === ms.length;
    }
    out[round] = per;
  }
  return out;
}

export interface ParticipantState {
  session: { id: string; name: string } | null;
  isAdmin: boolean;
  setupDone: boolean;
  currentOpenRound: RoundKey | null;
  activeStage: number;
  activeRounds: RoundKey[];
  participants: { id: string; name: string; display_order: number }[];
  matches: Match[];
  myPredictions: Record<string, { picked_team: string; confirmed: boolean }>;
  // 마감된 경기만 공개 (§2). key = matchId.
  revealed: Record<string, { participantId: string; name: string; picked_team: string }[]>;
  confirmByRound: Record<string, Record<string, boolean>>;
  // 마감(시간 경과/수동 잠금)된 경기 id 목록 — 클라 버튼 비활성·공개 판정용.
  closedMatches: string[];
  // 마감 전, 경기별로 "저장(픽)한" 참가자 id 목록 (픽 내용은 숨김, §2).
  savedByMatch: Record<string, string[]>;
  // 서버 기준 현재 시각(epoch ms) — 클라가 시작 시간 카운트다운/마감 판정에 사용.
  serverNow: number;
  standings: Standing[];
  gifts: GiftEdge[];
  // 미니게임(스코어 맞히기) — 없으면 null
  miniGame: MiniGameView | null;
}

export async function buildParticipantState(): Promise<ParticipantState> {
  const [session, admin, data] = await Promise.all([
    getParticipantSession(),
    isAdmin(),
    fetchAll(),
  ]);
  const { participants, settings, matches, predictions, miniPreds } = data;
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const myPredictions: ParticipantState["myPredictions"] = {};
  if (session) {
    for (const p of predictions) {
      if (p.participant_id === session.id) {
        myPredictions[p.match_id] = { picked_team: p.picked_team, confirmed: p.confirmed };
      }
    }
  }

  const now = Date.now();

  // 마감(시간 경과 또는 수동 잠금)된 경기만 모두의 예측 공개.
  // 마감 전 경기는 "누가 저장했는지"만 노출(픽 내용은 숨김, §2).
  const revealed: ParticipantState["revealed"] = {};
  const closedMatches: string[] = [];
  const savedByMatch: ParticipantState["savedByMatch"] = {};
  for (const m of matches) {
    const mine = predictions.filter((p) => p.match_id === m.id);
    if (matchClosed(m, now)) {
      closedMatches.push(m.id);
      revealed[m.id] = mine.map((p) => ({
        participantId: p.participant_id,
        name: nameById.get(p.participant_id) ?? "",
        picked_team: p.picked_team,
      }));
    } else {
      savedByMatch[m.id] = mine.filter((p) => p.confirmed).map((p) => p.participant_id);
    }
  }

  const standings = computeStandings(participants, matches, predictions);
  const gifts = computeGifts(standings);

  return {
    session: session ? { id: session.id, name: session.name } : null,
    isAdmin: admin,
    setupDone: settings?.setup_done ?? false,
    currentOpenRound: (settings?.current_open_round ?? null) as RoundKey | null,
    activeStage: activeStage(matches),
    activeRounds: activeRounds(matches),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      display_order: p.display_order,
    })),
    matches,
    myPredictions,
    revealed,
    confirmByRound: confirmByRound(participants, matches, predictions),
    closedMatches,
    savedByMatch,
    serverNow: now,
    standings,
    gifts,
    miniGame: buildMiniGame(settings, matches, miniPreds, nameById, now, {
      forAdmin: false,
      sessionId: session?.id ?? null,
    }),
  };
}

export interface AdminState {
  setupDone: boolean;
  adminPinSet: boolean;
  currentOpenRound: RoundKey | null;
  activeStage: number;
  activeRounds: RoundKey[];
  participants: { id: string; name: string; display_order: number; hasPin: boolean }[];
  matches: Match[];
  confirmByRound: Record<string, Record<string, boolean>>;
  // 경기별로 "저장(픽)한" 참가자 id 목록.
  savedByMatch: Record<string, string[]>;
  standings: Standing[];
  // 미니게임 — 없으면 null (관리자는 마감 전에도 추측 내용 공개)
  miniGame: MiniGameView | null;
}

export async function buildAdminState(): Promise<AdminState> {
  const sb = createServiceClient();
  const [pRes, sRes, mRes, prRes, mpRes] = await Promise.all([
    sb.from("participants").select("id,name,display_order,pin_hash").order("display_order"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("matches").select("*"),
    sb.from("predictions").select("*"),
    sb.from("mini_predictions").select("*"),
  ]);

  const participants = (pRes.data ?? []) as (Participant & { pin_hash: string | null })[];
  const settings = (sRes.data ?? null) as Settings & { admin_pin_hash: string | null };
  const matches = ((mRes.data ?? []) as Match[]).sort(
    (a, b) =>
      ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) ||
      a.bracket_slot - b.bracket_slot
  );
  const predictions = (prRes.data ?? []) as Prediction[];
  const miniPreds = (mpRes.data ?? []) as MiniPrediction[];
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const savedByMatch: Record<string, string[]> = {};
  for (const m of matches) {
    savedByMatch[m.id] = predictions
      .filter((p) => p.match_id === m.id && p.confirmed)
      .map((p) => p.participant_id);
  }

  return {
    setupDone: settings?.setup_done ?? false,
    adminPinSet: !!settings?.admin_pin_hash,
    currentOpenRound: (settings?.current_open_round ?? null) as RoundKey | null,
    activeStage: activeStage(matches),
    activeRounds: activeRounds(matches),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      display_order: p.display_order,
      hasPin: !!p.pin_hash,
    })),
    matches,
    confirmByRound: confirmByRound(participants, matches, predictions),
    savedByMatch,
    standings: computeStandings(participants, matches, predictions),
    miniGame: buildMiniGame(settings, matches, miniPreds, nameById, Date.now(), {
      forAdmin: true,
    }),
  };
}
