"use client";

import { useState } from "react";

import { Card } from "@/components/Card";
import { useAppState } from "@/components/StateProvider";
import { postJSON } from "@/lib/client-api";
import { ROUNDS, type RoundKey } from "@/lib/rounds";
import { matchesInRound } from "@/lib/tournament";
import type { Match } from "@/lib/types";

export default function PredictPage() {
  const { state, refresh } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state || !state.session) return null;
  const me = state.session;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const rounds = state.activeRounds;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-grass">예측</p>
          <h1 className="font-display text-2xl text-ink">{me.name}님</h1>
        </div>
        <button
          onClick={() => run(() => postJSON("/api/auth/logout", {}))}
          className="rounded-full border border-pitch-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
        >
          로그아웃
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {rounds.length === 0 && (
        <Card className="py-10 text-center text-sm text-ink-dim">
          예측할 라운드가 아직 열리지 않았어요.
        </Card>
      )}

      {rounds.map((round) => (
        <RoundSection key={round} round={round} busy={busy} run={run} meId={me.id} />
      ))}
    </div>
  );
}

function RoundSection({
  round,
  busy,
  run,
  meId,
}: {
  round: RoundKey;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  meId: string;
}) {
  const { state } = useAppState();
  if (!state) return null;

  const def = ROUNDS[round];
  const matches = matchesInRound(state.matches, round);
  const locked = matches.length > 0 && matches.every((m) => m.is_locked);
  const myConfirmed = state.confirmByRound[round]?.[meId] ?? false;
  const allPicked = matches.every((m) => state.myPredictions[m.id]);
  const editable = !locked && !myConfirmed;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">
          {def.label} <span className="text-sm text-ink-faint">예측</span>
        </h2>
        <span className="text-xs text-ink-faint">
          경기당 <span className="tabular text-grass">{def.pointsPerMatch}</span>점
        </span>
      </div>

      {/* 누가 확정했는지 (마감 전에도 공개, §2) */}
      <div className="flex flex-wrap gap-1.5">
        {state.participants.map((p) => {
          const done = state.confirmByRound[round]?.[p.id];
          return (
            <span
              key={p.id}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                done
                  ? "bg-grass/15 text-grass"
                  : "border border-pitch-line text-ink-faint"
              }`}
            >
              {p.name} {done ? "확정" : "대기"}
            </span>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} editable={editable} busy={busy} run={run} meId={meId} />
        ))}
      </div>

      {/* 확정 / 취소 */}
      {locked ? (
        <p className="text-center text-xs text-gold">🔒 마감된 라운드입니다.</p>
      ) : myConfirmed ? (
        <button
          onClick={() => run(() => postJSON("/api/predict", { action: "unconfirm", round }))}
          disabled={busy}
          className="rounded-xl border border-pitch-line py-2.5 text-sm text-ink-dim disabled:opacity-40"
        >
          확정 취소 (수정하려면)
        </button>
      ) : (
        <button
          onClick={() => run(() => postJSON("/api/predict", { action: "confirm", round }))}
          disabled={busy || !allPicked}
          className="rounded-xl bg-grass py-2.5 font-display text-base text-pitch-base disabled:opacity-40"
        >
          {allPicked ? "이 라운드 확정" : "모든 경기를 선택하세요"}
        </button>
      )}
    </Card>
  );
}

function MatchRow({
  match,
  editable,
  busy,
  run,
  meId,
}: {
  match: Match;
  editable: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  meId: string;
}) {
  const { state } = useAppState();
  const myPick = state?.myPredictions[match.id]?.picked_team ?? null;
  const revealed = state?.revealed[match.id];

  const pick = (team: string) =>
    run(() => postJSON("/api/predict", { action: "pick", matchId: match.id, pickedTeam: team }));

  const teamBtn = (team: string | null) => {
    if (!team) return <div className="rounded-lg border border-dashed border-pitch-line py-3" />;
    const selected = myPick === team;
    const isWinner = match.winner === team;
    const showResult = !!match.winner;
    let cls =
      "rounded-lg border py-3 px-2 text-center text-sm transition-colors min-w-0 truncate ";
    if (showResult) {
      if (isWinner) cls += "border-grass bg-grass/15 text-grass";
      else cls += "border-pitch-line text-ink-faint line-through";
    } else if (selected) {
      cls += "border-grass bg-grass/15 text-grass";
    } else {
      cls += "border-pitch-line text-ink hover:border-grass/40";
    }
    return (
      <button
        onClick={() => editable && pick(team)}
        disabled={!editable || busy}
        className={cls}
      >
        {team}
        {selected && (
          <span className="ml-1 text-[10px]">
            {showResult ? (isWinner ? "✓ 내픽" : "✗ 내픽") : "내픽"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="rounded-xl bg-black/10 p-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {teamBtn(match.team_a)}
        <span className="text-xs text-ink-faint">vs</span>
        {teamBtn(match.team_b)}
      </div>

      {/* 마감 후 4명 예측 공개 */}
      {revealed && revealed.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-ink-dim">
          {revealed.map((r) => {
            const correct = match.winner ? r.picked_team === match.winner : null;
            return (
              <span key={r.participantId}>
                {r.name}:{" "}
                <span
                  className={
                    correct === null ? "" : correct ? "text-grass" : "text-danger"
                  }
                >
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
