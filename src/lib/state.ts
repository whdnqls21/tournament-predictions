import "server-only";

import { getParticipantSession, isAdmin } from "./auth";
import { ROUND_ORDER, type RoundKey } from "./rounds";
import { createServiceClient } from "./supabase/server";
import {
  activeRounds,
  activeStage,
  computeGifts,
  computeStandings,
  matchesInRound,
  type GiftEdge,
  type Standing,
} from "./tournament";
import type { Match, Participant, Prediction, Settings } from "./types";

interface RawData {
  participants: Participant[];
  settings: Settings | null;
  matches: Match[];
  predictions: Prediction[];
}

async function fetchAll(): Promise<RawData> {
  const sb = createServiceClient();
  const [pRes, sRes, mRes, prRes] = await Promise.all([
    sb.from("participants").select("id,name,display_order,created_at").order("display_order"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("matches").select("*"),
    sb.from("predictions").select("*"),
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
  standings: Standing[];
  gifts: GiftEdge[];
}

export async function buildParticipantState(): Promise<ParticipantState> {
  const [session, admin, data] = await Promise.all([
    getParticipantSession(),
    isAdmin(),
    fetchAll(),
  ]);
  const { participants, settings, matches, predictions } = data;
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const myPredictions: ParticipantState["myPredictions"] = {};
  if (session) {
    for (const p of predictions) {
      if (p.participant_id === session.id) {
        myPredictions[p.match_id] = { picked_team: p.picked_team, confirmed: p.confirmed };
      }
    }
  }

  // 마감(is_locked)된 경기만 모두의 예측 공개
  const revealed: ParticipantState["revealed"] = {};
  for (const m of matches) {
    if (!m.is_locked) continue;
    revealed[m.id] = predictions
      .filter((p) => p.match_id === m.id)
      .map((p) => ({
        participantId: p.participant_id,
        name: nameById.get(p.participant_id) ?? "",
        picked_team: p.picked_team,
      }));
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
    standings,
    gifts,
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
  standings: Standing[];
}

export async function buildAdminState(): Promise<AdminState> {
  const sb = createServiceClient();
  const [pRes, sRes, mRes, prRes] = await Promise.all([
    sb.from("participants").select("id,name,display_order,pin_hash").order("display_order"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("matches").select("*"),
    sb.from("predictions").select("*"),
  ]);

  const participants = (pRes.data ?? []) as (Participant & { pin_hash: string | null })[];
  const settings = (sRes.data ?? null) as Settings & { admin_pin_hash: string | null };
  const matches = ((mRes.data ?? []) as Match[]).sort(
    (a, b) =>
      ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) ||
      a.bracket_slot - b.bracket_slot
  );
  const predictions = (prRes.data ?? []) as Prediction[];

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
    standings: computeStandings(participants, matches, predictions),
  };
}
