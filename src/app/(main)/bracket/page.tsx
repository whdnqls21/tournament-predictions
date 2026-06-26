"use client";

import { Card } from "@/components/Card";
import { useAppState } from "@/components/StateProvider";
import { ROUND_ORDER, ROUNDS } from "@/lib/rounds";
import { matchesInRound } from "@/lib/tournament";
import type { Match } from "@/lib/types";

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
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-grass" /> 내 예측 적중
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" /> 빗나감
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-gold" /> 진출
        </span>
      </div>

      {ROUND_ORDER.map((round) => {
        const matches = matchesInRound(state.matches, round);
        if (matches.length === 0) return null;
        const def = ROUNDS[round];
        const hasTeams = matches.some((m) => m.team_a || m.team_b);
        return (
          <Card key={round} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-ink">{def.label}</h2>
              {!hasTeams && <span className="text-xs text-ink-faint">미정</span>}
            </div>
            <div className="flex flex-col gap-2">
              {matches.map((m) => (
                <BracketMatch key={m.id} match={m} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function BracketMatch({ match }: { match: Match }) {
  const { state } = useAppState();
  const myPick = state?.myPredictions[match.id]?.picked_team ?? null;
  const revealed = state?.revealed[match.id] ?? [];

  const row = (team: string | null) => {
    if (!team) {
      return <div className="px-3 py-2 text-sm text-ink-faint">미정</div>;
    }
    const isWinner = match.winner === team;
    const mine = myPick === team;
    let mark = "";
    let color = "text-ink";
    if (mine) {
      if (match.winner) {
        const correct = team === match.winner;
        color = correct ? "text-grass" : "text-danger";
        mark = correct ? "✓" : "✗";
      } else {
        color = "text-grass";
        mark = "●";
      }
    }
    return (
      <div
        className={`flex items-center justify-between px-3 py-2 text-sm ${
          isWinner ? "bg-gold/10" : ""
        }`}
      >
        <span className={`truncate ${color} ${isWinner ? "font-medium" : ""}`}>
          {mine && <span className="mr-1 text-[10px]">{mark}</span>}
          {team}
        </span>
        {isWinner && (
          <span className="ml-2 shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold">
            진출
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-pitch-line bg-black/10">
      {row(match.team_a)}
      <div className="h-px bg-pitch-line" />
      {row(match.team_b)}

      {/* 마감된 라운드는 4명 예측 공개 (§6) */}
      {match.is_locked && revealed.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-pitch-line bg-black/20 px-3 py-1.5 text-[11px] text-ink-dim">
          {revealed.map((r) => {
            const correct = match.winner ? r.picked_team === match.winner : null;
            return (
              <span key={r.participantId}>
                {r.name}:{" "}
                <span className={correct === null ? "" : correct ? "text-grass" : "text-danger"}>
                  {r.picked_team}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
