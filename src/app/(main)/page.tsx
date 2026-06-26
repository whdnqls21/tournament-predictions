"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { useAppState } from "@/components/StateProvider";
import { postJSON } from "@/lib/client-api";
import { ROUND_ORDER, ROUNDS, type RoundKey } from "@/lib/rounds";
import { formatCountdown, formatKickoff } from "@/lib/time";
import { matchClosed, matchesInRound } from "@/lib/tournament";
import type { Match } from "@/lib/types";

// 1초마다 갱신되는 현재 시각(epoch ms) — 시작 시간이 지나는 순간 UI 마감 반영.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function PredictPage() {
  const { state, refresh } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

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

  // 세팅된(양 팀이 정해진) 경기가 하나라도 있는 라운드만 노출.
  const rounds = ROUND_ORDER.filter((r) =>
    matchesInRound(state.matches, r).some((m) => m.team_a && m.team_b)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-grass">예측</p>
          <h1 className="font-display text-2xl text-ink">{me.name}님</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPin((v) => !v)}
            className="rounded-full border border-pitch-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
          >
            PIN 변경
          </button>
          <button
            onClick={() => run(() => postJSON("/api/auth/logout", {}))}
            className="rounded-full border border-pitch-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
          >
            로그아웃
          </button>
        </div>
      </div>

      {showPin && <ChangePinCard onClose={() => setShowPin(false)} />}

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        팀을 누르면 바로 저장돼요. 경기 시작 시간 전까지는 다시 눌러 바꿀 수 있어요.
      </p>

      {rounds.length === 0 && (
        <Card className="py-10 text-center text-sm text-ink-dim">
          예측할 라운드가 아직 열리지 않았어요.
        </Card>
      )}

      {rounds.map((round) => (
        <RoundSection key={round} round={round} busy={busy} run={run} />
      ))}
    </div>
  );
}

function ChangePinCard({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);
  const valid = cur.length === 4 && next.length === 4 && confirm.length === 4;

  async function submit() {
    if (!valid) return;
    if (next !== confirm) {
      setError("새 PIN이 서로 일치하지 않아요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJSON("/api/auth/change-pin", { currentPin: cur, newPin: next });
      setDone(true);
      setCur("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  const pinInput = (
    value: string,
    setValue: (v: string) => void,
    placeholder: string,
    autoFocus = false
  ) => (
    <input
      autoFocus={autoFocus}
      type="password"
      inputMode="numeric"
      pattern="\d*"
      maxLength={4}
      value={value}
      onChange={(e) => {
        setValue(onlyDigits(e.target.value));
        setDone(false);
        setError(null);
      }}
      placeholder={placeholder}
      className="tabular w-full rounded-lg border border-pitch-line bg-black/20 px-3 py-2 text-center text-lg tracking-[0.3em] text-ink outline-none focus:border-grass"
    />
  );

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base text-ink">PIN 변경</h2>
        <button onClick={onClose} className="text-xs text-ink-faint hover:text-ink">
          닫기
        </button>
      </div>

      {done ? (
        <p className="text-center text-sm text-grass">✓ PIN이 변경되었어요.</p>
      ) : (
        <>
          {pinInput(cur, setCur, "현재 PIN", true)}
          {pinInput(next, setNext, "새 PIN")}
          {pinInput(confirm, setConfirm, "새 PIN 확인")}
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="rounded-xl bg-grass py-2.5 font-display text-base text-pitch-base disabled:opacity-40"
          >
            {busy ? "변경 중…" : "변경"}
          </button>
        </>
      )}

      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </Card>
  );
}

function RoundSection({
  round,
  busy,
  run,
}: {
  round: RoundKey;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { state } = useAppState();
  const now = useNow();
  if (!state) return null;

  const def = ROUNDS[round];
  // 양 팀이 정해진 경기만 (아직 대진 미정인 슬롯은 숨김) + 시작 시간 오름차순.
  const matches = matchesInRound(state.matches, round)
    .filter((m) => m.team_a && m.team_b)
    .sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
      if (ta !== tb) return ta - tb; // 시간 미정(null)은 뒤로
      return a.bracket_slot - b.bracket_slot;
    });
  if (matches.length === 0) return null;

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

      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} now={now} busy={busy} run={run} />
        ))}
      </div>
    </Card>
  );
}

function MatchRow({
  match,
  now,
  busy,
  run,
}: {
  match: Match;
  now: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { state } = useAppState();
  const myPick = state?.myPredictions[match.id]?.picked_team ?? null;
  const revealed = state?.revealed[match.id];
  const savedIds = state?.savedByMatch[match.id] ?? [];

  const closed = matchClosed(match, now);
  const editable = !closed && !!match.team_a && !!match.team_b;
  const countdown = formatCountdown(match.starts_at, now);

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
    } else if (editable) {
      cls += "border-pitch-line text-ink hover:border-grass/40";
    } else {
      cls += "border-pitch-line text-ink-faint";
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
      {/* 시작 시간 / 상태 */}
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11px]">
        <span className="text-ink-faint">⏰ {formatKickoff(match.starts_at)}</span>
        {closed ? (
          <span className="text-gold">{match.winner ? "결과 완료" : "🔒 예측 마감"}</span>
        ) : countdown ? (
          <span className="text-grass">{countdown} 시작</span>
        ) : (
          <span className="text-ink-faint">예측 중</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {teamBtn(match.team_a)}
        <span className="text-xs text-ink-faint">vs</span>
        {teamBtn(match.team_b)}
      </div>

      {/* 마감 후: 4명 예측 공개 / 마감 전: 누가 저장했는지만 */}
      {closed ? (
        revealed && revealed.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-ink-dim">
            {revealed.map((r) => {
              const correct = match.winner ? r.picked_team === match.winner : null;
              return (
                <span key={r.participantId}>
                  {r.name}:{" "}
                  <span
                    className={correct === null ? "" : correct ? "text-grass" : "text-danger"}
                  >
                    {r.picked_team}
                  </span>
                </span>
              );
            })}
          </div>
        ) : null
      ) : (
        match.team_a &&
        match.team_b && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-1">
            {state?.participants.map((p) => {
              const done = savedIds.includes(p.id);
              return (
                <span
                  key={p.id}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    done ? "bg-grass/15 text-grass" : "border border-pitch-line text-ink-faint"
                  }`}
                >
                  {p.name} {done ? "저장✓" : "…"}
                </span>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
