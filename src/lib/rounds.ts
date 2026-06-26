// §3 배점 / §8 라운드 키 정의 — 채점·UI 공통 기준.

export type RoundKey = "R32" | "R16" | "R8" | "SF" | "FINAL" | "THIRD";

export interface RoundDef {
  key: RoundKey;
  label: string; // 한글 라벨
  matches: number; // 경기 수
  pointsPerMatch: number; // 경기당 점수
  /**
   * 진행 순서(예측 오픈 순서). FINAL·THIRD 는 SF 결과 입력 후 함께 열리므로
   * 같은 단계(4)를 가진다.
   */
  stage: number;
}

export const ROUNDS: Record<RoundKey, RoundDef> = {
  R32: { key: "R32", label: "32강", matches: 16, pointsPerMatch: 1, stage: 0 },
  R16: { key: "R16", label: "16강", matches: 8, pointsPerMatch: 2, stage: 1 },
  R8: { key: "R8", label: "8강", matches: 4, pointsPerMatch: 4, stage: 2 },
  SF: { key: "SF", label: "4강", matches: 2, pointsPerMatch: 6, stage: 3 },
  FINAL: { key: "FINAL", label: "결승", matches: 1, pointsPerMatch: 10, stage: 4 },
  THIRD: { key: "THIRD", label: "3·4위전", matches: 1, pointsPerMatch: 4, stage: 4 },
};

// 브라켓 진행/표시 순서
export const ROUND_ORDER: RoundKey[] = ["R32", "R16", "R8", "SF", "FINAL", "THIRD"];

// 라운드 만점 / 전체 만점
export function roundMaxPoints(key: RoundKey): number {
  const r = ROUNDS[key];
  return r.matches * r.pointsPerMatch;
}

export const TOTAL_POINTS = ROUND_ORDER.reduce((sum, k) => sum + roundMaxPoints(k), 0); // = 74
