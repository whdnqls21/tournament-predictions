// 토너먼트 순수 로직 검증. 실행:
//   node_modules/.bin/tsc -p tsconfig.test.json && node .test-build/scripts/test-tournament.js
import {
  computeGifts,
  computeStandings,
  loserOf,
  nextStageAssignments,
} from "../src/lib/tournament";
import type { Match, Participant, Prediction } from "../src/lib/types";
import type { RoundKey } from "../src/lib/rounds";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

const team = (n: number) => `T${n}`;

// 결과까지 채운 풀 브라켓 — "홀수 팀이 올라간다" 규칙으로 결정적 구성.
function buildBracket(): Match[] {
  const ms: Match[] = [];
  let i = 0;
  const add = (round: RoundKey, slot: number, a: string, b: string, winner: string | null) =>
    ms.push({
      id: `m${i++}`,
      round,
      bracket_slot: slot,
      team_a: a,
      team_b: b,
      winner,
      is_locked: true,
      created_at: "",
      updated_at: "",
    });

  for (let s = 0; s < 16; s++) add("R32", s, team(2 * s + 1), team(2 * s + 2), team(2 * s + 1));
  for (let j = 0; j < 8; j++) add("R16", j, team(4 * j + 1), team(4 * j + 3), team(4 * j + 1));
  for (let k = 0; k < 4; k++) add("R8", k, team(8 * k + 1), team(8 * k + 5), team(8 * k + 1));
  for (let m = 0; m < 2; m++) add("SF", m, team(16 * m + 1), team(16 * m + 9), team(16 * m + 1));
  add("FINAL", 0, team(1), team(17), team(1)); // 우승 T1
  add("THIRD", 0, team(9), team(25), team(9)); // SF 패자 T9 vs T25, 3위 T9
  return ms;
}

const participants: Participant[] = [
  { id: "A", name: "윤", display_order: 1, created_at: "" },
  { id: "B", name: "준", display_order: 2, created_at: "" },
  { id: "C", name: "경", display_order: 3, created_at: "" },
  { id: "D", name: "빈", display_order: 4, created_at: "" },
];

// 참가자별 "정답 여부" 규칙 → 맞으면 winner, 틀리면 loser 를 찍음 (confirmed=true)
function isCorrect(pid: string, m: Match): boolean {
  if (pid === "A") return true; // 전부 정답 → 74점
  if (pid === "B") return !(m.round === "FINAL"); // 결승만 틀림 → 64점
  if (pid === "C") return !(m.round === "SF"); // SF 둘 다 틀림 → 62점
  if (pid === "D") return !(m.round === "R32" && m.bracket_slot < 10); // R32 10경기 틀림 → 64점
  return true;
}

function buildPredictions(matches: Match[]): Prediction[] {
  const preds: Prediction[] = [];
  let i = 0;
  for (const part of participants) {
    for (const m of matches) {
      const correct = isCorrect(part.id, m);
      const picked = correct ? m.winner! : loserOf(m)!;
      preds.push({
        id: `p${i++}`,
        participant_id: part.id,
        match_id: m.id,
        picked_team: picked,
        confirmed: true,
        created_at: "",
        updated_at: "",
      });
    }
  }
  return preds;
}

console.log("\n[1] nextStageAssignments: R32 → R16");
{
  const full = buildBracket();
  // R16 팀을 비운 상태로 두고 배정 계산
  const matches = full.map((m) =>
    m.round === "R16" ? { ...m, team_a: null, team_b: null, winner: null } : m
  );
  const asg = nextStageAssignments(matches, "R32");
  eq(asg.length, 8, "R16 8경기 배정");
  const slot0 = asg.find((a) => a.matchId === full.find((m) => m.round === "R16" && m.bracket_slot === 0)!.id)!;
  eq(slot0.team_a, "T1", "R16 slot0 team_a = R32 slot0 승자");
  eq(slot0.team_b, "T3", "R16 slot0 team_b = R32 slot1 승자");
}

console.log("\n[2] nextStageAssignments: SF → FINAL/THIRD");
{
  const full = buildBracket();
  const matches = full.map((m) =>
    m.round === "FINAL" || m.round === "THIRD"
      ? { ...m, team_a: null, team_b: null, winner: null }
      : m
  );
  const asg = nextStageAssignments(matches, "SF");
  eq(asg.length, 2, "FINAL + THIRD 배정");
  const finalId = full.find((m) => m.round === "FINAL")!.id;
  const thirdId = full.find((m) => m.round === "THIRD")!.id;
  const fa = asg.find((a) => a.matchId === finalId)!;
  const th = asg.find((a) => a.matchId === thirdId)!;
  eq(fa.team_a, "T1", "FINAL team_a = SF0 승자");
  eq(fa.team_b, "T17", "FINAL team_b = SF1 승자");
  eq(th.team_a, "T9", "THIRD team_a = SF0 패자");
  eq(th.team_b, "T25", "THIRD team_b = SF1 패자");
}

console.log("\n[3] computeStandings: 총점/동점/등수");
{
  const matches = buildBracket();
  const preds = buildPredictions(matches);
  const st = computeStandings(participants, matches, preds);
  const byId = Object.fromEntries(st.map((s) => [s.participantId, s]));

  eq(byId.A.total, 74, "A 총점 74(만점)");
  eq(byId.B.total, 64, "B 총점 64(결승만 틀림)");
  eq(byId.C.total, 62, "C 총점 62(SF 둘 다 틀림)");
  eq(byId.D.total, 64, "D 총점 64(R32 10경기 틀림)");

  eq(byId.A.championCorrect, true, "A 우승팀 적중");
  eq(byId.B.championCorrect, false, "B 우승팀 못맞힘");
  eq(byId.C.championCorrect, true, "C 우승팀 적중");
  eq(byId.D.championCorrect, true, "D 우승팀 적중");

  eq(byId.A.finalistCorrect, 2, "A 결승2팀 적중");
  eq(byId.C.finalistCorrect, 0, "C 결승2팀 0 (SF 틀림)");
  eq(byId.D.finalistCorrect, 2, "D 결승2팀 적중");

  // 등수: A=1, D=2(64+우승적중), B=3(64+우승못맞힘), C=4(62)
  eq(byId.A.rank, 1, "A 1등");
  eq(byId.D.rank, 2, "D 2등 (B와 동점이나 우승팀 적중 우선)");
  eq(byId.B.rank, 3, "B 3등");
  eq(byId.C.rank, 4, "C 4등");

  // 라운드 분해 확인 (D)
  eq(byId.D.perRound.R32, 6, "D R32 6점 (16-10)");
  eq(byId.D.perRound.FINAL, 10, "D 결승 10점");
}

console.log("\n[4] computeGifts: 정산 (위 등수에게만)");
{
  const matches = buildBracket();
  const preds = buildPredictions(matches);
  const st = computeStandings(participants, matches, preds);
  const gifts = computeGifts(st);
  eq(gifts.length, 6, "총 6개 (3+2+1+0)");
  const from = (id: string) => gifts.filter((g) => g.giverId === id).length;
  eq(from("A"), 0, "1등 A 0개 줌");
  eq(from("D"), 1, "2등 D 1개 줌(→A)");
  eq(from("B"), 2, "3등 B 2개 줌(→A,D)");
  eq(from("C"), 3, "4등 C 3개 줌(→A,D,B)");
}

console.log("\n[5] computeGifts: 공동 등수는 서로 안 줌");
{
  // 모두 동일 → 전원 공동 1등 → 선물 0
  const matches = buildBracket();
  const preds: Prediction[] = [];
  let i = 0;
  for (const part of participants) {
    for (const m of matches) {
      preds.push({
        id: `q${i++}`,
        participant_id: part.id,
        match_id: m.id,
        picked_team: m.winner!,
        confirmed: true,
        created_at: "",
        updated_at: "",
      });
    }
  }
  const st = computeStandings(participants, matches, preds);
  assert(st.every((s) => s.rank === 1), "전원 공동 1등");
  eq(computeGifts(st).length, 0, "동순위끼리 선물 0");
}

console.log("\n[6] 미확정 예측은 0점");
{
  const matches = buildBracket();
  const preds: Prediction[] = matches.map((m, idx) => ({
    id: `r${idx}`,
    participant_id: "A",
    match_id: m.id,
    picked_team: m.winner!, // 전부 정답이지만
    confirmed: false, // 확정 안 함
    created_at: "",
    updated_at: "",
  }));
  const st = computeStandings(participants, matches, preds);
  eq(st.find((s) => s.participantId === "A")!.total, 0, "확정 안 한 A 총점 0");
}

console.log(`\n${failures === 0 ? "✅ 모든 테스트 통과" : `❌ ${failures}건 실패`}`);
process.exit(failures === 0 ? 0 : 1);
