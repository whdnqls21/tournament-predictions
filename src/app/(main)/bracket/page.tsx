"use client";

import { useAppState } from "@/components/StateProvider";
import { ROUNDS, type RoundKey } from "@/lib/rounds";
import { getMatch, ROUND_SLOT_COUNT } from "@/lib/tournament";
import type { Match } from "@/lib/types";

// 좌 → 우 컬럼. 32강 슬롯 0,1 승자 → 16강 슬롯 0 … 식으로 좁혀진다.
// conn = 오른쪽 짝 커넥터 표시(다음 라운드로 합쳐지는 라운드만).
// 3·4위전은 결승 바로 왼쪽에 별도 칸으로 둔다.
const COLS: { round: RoundKey; conn: boolean }[] = [
  { round: "R32", conn: true },
  { round: "R16", conn: true },
  { round: "R8", conn: true },
  { round: "SF", conn: false },
  { round: "THIRD", conn: false },
  { round: "FINAL", conn: false },
];

export default function BracketPage() {
  const { state } = useAppState();
  if (!state) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1">
        <p className="text-xs uppercase tracking-[0.2em] text-grass">대진표</p>
        <h1 className="font-display text-2xl text-ink">토너먼트 브라켓</h1>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-dim">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-grass" /> 적중
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" /> 빗나감
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-gold" /> 진출
        </span>
        <span className="ml-auto text-ink-faint">← 좌우로 넘겨보기 →</span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="bracket">
          {COLS.map(({ round, conn }) => (
            <div key={round} className="bracket-col">
              <div className="bracket-head font-display text-sm text-ink">
                {ROUNDS[round].label}
              </div>
              <div className={`bracket-cells${conn ? " bracket-cells-conn" : ""}`}>
                {Array.from({ length: ROUND_SLOT_COUNT[round] }, (_, slot) => (
                  <div key={slot} className="bracket-cell">
                    <BracketNode match={getMatch(state.matches, round, slot)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketNode({ match }: { match: Match | undefined }) {
  const { state } = useAppState();
  const myPick = match ? state?.myPredictions[match.id]?.picked_team ?? null : null;
  const winner = match?.winner ?? null;

  const row = (team: string | null) => {
    if (!team) {
      return <div className="px-2 py-1.5 text-xs text-ink-faint">미정</div>;
    }
    const isWinner = winner === team;
    const mine = myPick === team;
    let mark = "";
    let color = "text-ink";
    if (mine) {
      if (winner) {
        const correct = team === winner;
        color = correct ? "text-grass" : "text-danger";
        mark = correct ? "✓" : "✗";
      } else {
        color = "text-grass";
        mark = "●";
      }
    }
    return (
      <div
        className={`flex items-center gap-1 px-2 py-1.5 text-xs ${isWinner ? "bg-gold/10" : ""}`}
      >
        {mine && <span className="shrink-0 text-[9px]">{mark}</span>}
        <span className={`truncate ${color} ${isWinner ? "font-medium" : ""}`}>{team}</span>
        {isWinner && <span className="ml-auto shrink-0 text-[9px] text-gold">진출</span>}
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-pitch-line bg-black/20">
      {row(match?.team_a ?? null)}
      <div className="h-px bg-pitch-line" />
      {row(match?.team_b ?? null)}
    </div>
  );
}
