// 토너먼트 순수 로직 — 브라켓 진행 / 채점 / 동점 / 등수 / 선물 정산.
// DB·서버 의존 없음(순수 함수) → 단위 테스트 가능(scripts/test-tournament.ts).
import { ROUND_ORDER, ROUNDS, roundMaxPoints, type RoundKey } from "./rounds";
import type { Match, Participant, Prediction } from "./types";

// 단계(stage)별 라운드. FINAL·THIRD 는 SF 결과 후 함께 열린다(stage 4).
export const STAGE_ROUNDS: RoundKey[][] = [
  ["R32"],
  ["R16"],
  ["R8"],
  ["SF"],
  ["FINAL", "THIRD"],
];

// 라운드별 경기 수 → 셋업 시 빈 경기 생성에 사용
export const ROUND_SLOT_COUNT: Record<RoundKey, number> = {
  R32: 16,
  R16: 8,
  R8: 4,
  SF: 2,
  FINAL: 1,
  THIRD: 1,
};

export function matchesInRound(matches: Match[], round: RoundKey): Match[] {
  return matches
    .filter((m) => m.round === round)
    .sort((a, b) => a.bracket_slot - b.bracket_slot);
}

export function getMatch(matches: Match[], round: RoundKey, slot: number): Match | undefined {
  return matches.find((m) => m.round === round && m.bracket_slot === slot);
}

export function roundHasTeams(matches: Match[], round: RoundKey): boolean {
  const ms = matchesInRound(matches, round);
  if (ms.length === 0) return false;
  return ms.every((m) => !!m.team_a && !!m.team_b);
}

export function roundFullyResulted(matches: Match[], round: RoundKey): boolean {
  const ms = matchesInRound(matches, round);
  if (ms.length === 0) return false;
  return ms.every((m) => !!m.winner);
}

export function roundLocked(matches: Match[], round: RoundKey): boolean {
  const ms = matchesInRound(matches, round);
  if (ms.length === 0) return false;
  return ms.every((m) => m.is_locked);
}

// 현재 활성 단계: 팀이 채워진(예측 가능) 가장 높은 단계.
export function activeStage(matches: Match[]): number {
  let stage = -1;
  for (let s = 0; s < STAGE_ROUNDS.length; s++) {
    if (STAGE_ROUNDS[s].every((r) => roundHasTeams(matches, r))) {
      stage = s;
    }
  }
  return stage;
}

export function activeRounds(matches: Match[]): RoundKey[] {
  const s = activeStage(matches);
  return s < 0 ? [] : STAGE_ROUNDS[s];
}

export function stageOfRound(round: RoundKey): number {
  return STAGE_ROUNDS.findIndex((rs) => rs.includes(round));
}

// 한 경기에서 진 팀
export function loserOf(m: Match): string | null {
  if (!m.winner || !m.team_a || !m.team_b) return null;
  return m.winner === m.team_a ? m.team_b : m.team_a;
}

// 어떤 라운드가 막 끝났을 때, 다음 단계 경기에 채울 팀 배정.
// 반환: [{ matchId, team_a, team_b }]
export interface SlotAssignment {
  matchId: string;
  team_a: string;
  team_b: string;
}

export function nextStageAssignments(matches: Match[], completedRound: RoundKey): SlotAssignment[] {
  const assignments: SlotAssignment[] = [];

  const winnerAt = (round: RoundKey, slot: number): string | null =>
    getMatch(matches, round, slot)?.winner ?? null;

  if (completedRound === "R32" || completedRound === "R16" || completedRound === "R8") {
    const nextRound: RoundKey =
      completedRound === "R32" ? "R16" : completedRound === "R16" ? "R8" : "SF";
    const nextCount = ROUND_SLOT_COUNT[nextRound];
    for (let slot = 0; slot < nextCount; slot++) {
      const a = winnerAt(completedRound, slot * 2);
      const b = winnerAt(completedRound, slot * 2 + 1);
      const target = getMatch(matches, nextRound, slot);
      if (target && a && b) {
        assignments.push({ matchId: target.id, team_a: a, team_b: b });
      }
    }
  } else if (completedRound === "SF") {
    const sf0 = getMatch(matches, "SF", 0);
    const sf1 = getMatch(matches, "SF", 1);
    const final = getMatch(matches, "FINAL", 0);
    const third = getMatch(matches, "THIRD", 0);
    if (sf0 && sf1 && sf0.winner && sf1.winner && final) {
      assignments.push({ matchId: final.id, team_a: sf0.winner, team_b: sf1.winner });
    }
    const l0 = sf0 ? loserOf(sf0) : null;
    const l1 = sf1 ? loserOf(sf1) : null;
    if (third && l0 && l1) {
      assignments.push({ matchId: third.id, team_a: l0, team_b: l1 });
    }
  }

  return assignments;
}

// ────────────────────────────────────────────────────────────────────────
// 채점 / 등수 / 선물
// ────────────────────────────────────────────────────────────────────────
export interface Standing {
  participantId: string;
  name: string;
  total: number;
  perRound: Record<RoundKey, number>;
  championCorrect: boolean; // 동점 1순위: 우승팀 적중
  finalistCorrect: number; // 동점 2순위: 결승 진출 2팀 적중 수 (0~2)
  rank: number;
}

export interface GiftEdge {
  giverId: string;
  giverName: string;
  receiverId: string;
  receiverName: string;
}

function emptyPerRound(): Record<RoundKey, number> {
  return { R32: 0, R16: 0, R8: 0, SF: 0, FINAL: 0, THIRD: 0 };
}

export function computeStandings(
  participants: Participant[],
  matches: Match[],
  predictions: Prediction[]
): Standing[] {
  // (participantId, matchId) → prediction
  const predBy = new Map<string, Prediction>();
  for (const p of predictions) {
    predBy.set(`${p.participant_id}:${p.match_id}`, p);
  }

  const finalMatch = getMatch(matches, "FINAL", 0);
  const sfMatches = matchesInRound(matches, "SF");

  const standings: Standing[] = participants.map((part) => {
    const perRound = emptyPerRound();

    for (const round of ROUND_ORDER) {
      const ms = matchesInRound(matches, round);
      let pts = 0;
      for (const m of ms) {
        if (!m.winner) continue; // 결과 미입력 → 점수 없음
        const pred = predBy.get(`${part.id}:${m.id}`);
        if (pred && pred.confirmed && pred.picked_team === m.winner) {
          pts += ROUNDS[round].pointsPerMatch;
        }
      }
      perRound[round] = pts;
    }

    const total = ROUND_ORDER.reduce((s, r) => s + perRound[r], 0);

    // 동점 1순위: 우승팀(결승 승자) 적중
    let championCorrect = false;
    if (finalMatch && finalMatch.winner) {
      const pred = predBy.get(`${part.id}:${finalMatch.id}`);
      championCorrect = !!pred && pred.confirmed && pred.picked_team === finalMatch.winner;
    }

    // 동점 2순위: 결승 진출 2팀 적중 수 = SF 승팀(=결승 진출팀) 적중 수
    let finalistCorrect = 0;
    for (const sf of sfMatches) {
      if (!sf.winner) continue;
      const pred = predBy.get(`${part.id}:${sf.id}`);
      if (pred && pred.confirmed && pred.picked_team === sf.winner) finalistCorrect += 1;
    }

    return {
      participantId: part.id,
      name: part.name,
      total,
      perRound,
      championCorrect,
      finalistCorrect,
      rank: 0,
    };
  });

  // 정렬: 총점 ↓, 우승팀적중 ↓, 결승2팀적중 ↓
  const sorted = [...standings].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.championCorrect !== b.championCorrect) return a.championCorrect ? -1 : 1;
    return b.finalistCorrect - a.finalistCorrect;
  });

  // 등수 부여 (경쟁 등수: 1,2,2,4). 세 기준 모두 같으면 공동 등수.
  const sameRank = (a: Standing, b: Standing) =>
    a.total === b.total &&
    a.championCorrect === b.championCorrect &&
    a.finalistCorrect === b.finalistCorrect;

  sorted.forEach((s, i) => {
    if (i > 0 && sameRank(s, sorted[i - 1])) {
      s.rank = sorted[i - 1].rank;
    } else {
      s.rank = i + 1;
    }
  });

  return sorted;
}

// 선물: 자기보다 "엄격히 위" 등수인 사람 각각에게 1개. 동순위끼리는 주고받지 않음.
export function computeGifts(standings: Standing[]): GiftEdge[] {
  const edges: GiftEdge[] = [];
  for (const giver of standings) {
    for (const receiver of standings) {
      if (receiver.rank < giver.rank) {
        edges.push({
          giverId: giver.participantId,
          giverName: giver.name,
          receiverId: receiver.participantId,
          receiverName: receiver.name,
        });
      }
    }
  }
  return edges;
}

// 참고: 라운드 만점(채점 UI 보조)
export function roundMax(round: RoundKey): number {
  return roundMaxPoints(round);
}
