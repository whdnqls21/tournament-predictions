"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { useAppState } from "@/components/StateProvider";
import { postJSON } from "@/lib/client-api";
import { formatCountdown, formatKickoff } from "@/lib/time";

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function MiniGamePage() {
  const { state, refresh } = useAppState();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;
  const mini = state.miniGame;

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1">
        <p className="text-xs uppercase tracking-[0.2em] text-grass">미니게임</p>
        <h1 className="font-display text-2xl text-ink">스코어 맞히기 🎯</h1>
        <p className="mt-1 text-xs text-ink-faint">
          정확한 스코어를 맞히면 적중! 메인 게임 순위와는 무관한 별도 게임이에요.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {!mini ? (
        <Card className="py-10 text-center text-sm text-ink-dim">
          진행 중인 미니게임이 없어요.
        </Card>
      ) : (
        <MiniCard
          mini={mini}
          now={now}
          participants={state.participants}
          busy={busy}
          run={async (fn) => {
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
          }}
        />
      )}
    </div>
  );
}

type Mini = NonNullable<ReturnType<typeof useAppState>["state"]>["miniGame"];

function MiniCard({
  mini,
  now,
  participants,
  busy,
  run,
}: {
  mini: NonNullable<Mini>;
  now: number;
  participants: { id: string; name: string }[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const closed =
    mini.closed || (!!mini.startsAt && now >= new Date(mini.startsAt).getTime());
  const submitted = mini.myGuess !== null;
  const [a, setA] = useState(mini.myGuess?.a ?? 0);
  const [b, setB] = useState(mini.myGuess?.b ?? 0);

  const editable = !closed && !submitted;
  const countdown = formatCountdown(mini.startsAt, now);
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const step = (side: "a" | "b", delta: number) => {
    if (!editable) return;
    if (side === "a") setA((v) => Math.max(0, Math.min(50, v + delta)));
    else setB((v) => Math.max(0, Math.min(50, v + delta)));
  };

  const submit = () => run(() => postJSON("/api/minigame", { action: "submit", a, b }));
  const withdraw = () => run(() => postJSON("/api/minigame", { action: "withdraw" }));

  // 제출됨이면 서버에 저장된 값, 편집 중이면 로컬 값 표시
  const showA = !closed && submitted ? mini.myGuess!.a : a;
  const showB = !closed && submitted ? mini.myGuess!.b : b;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-faint">⏰ {formatKickoff(mini.startsAt)}</span>
        {closed ? (
          <span className="text-gold">🔒 마감</span>
        ) : countdown ? (
          <span className="text-grass">{countdown} 시작</span>
        ) : (
          <span className="text-ink-faint">진행 중</span>
        )}
      </div>

      {!closed && (
        <>
          {/* 스코어 입력 — +/− 로 맞춘 뒤 제출해야 저장 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <ScoreColumn team={mini.teamA} value={showA} editable={editable} busy={busy} onStep={(d) => step("a", d)} />
            <span className="text-center font-display text-2xl text-ink-faint">:</span>
            <ScoreColumn team={mini.teamB} value={showB} editable={editable} busy={busy} onStep={(d) => step("b", d)} />
          </div>

          {submitted ? (
            <div className="flex flex-col gap-2">
              <p className="text-center text-sm text-grass">✓ 제출 완료</p>
              <button
                onClick={withdraw}
                disabled={busy}
                className="rounded-xl border border-pitch-line py-2.5 text-sm text-ink-dim disabled:opacity-40"
              >
                제출 회수 (수정하려면)
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-xl bg-grass py-2.5 font-display text-base text-pitch-base disabled:opacity-40"
              >
                제출
              </button>
              <p className="text-center text-[11px] text-ink-faint">
                +/− 로 스코어를 맞춘 뒤 <b>제출</b>하세요. 시작 전까지 회수·수정 가능.
              </p>
            </div>
          )}
        </>
      )}

      {/* 마감 전: 누가 제출했는지 / 마감 후: 모두의 추측 + 실제 스코어 */}
      {!closed ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {participants.map((p) => {
            const done = mini.savedBy.includes(p.id);
            return (
              <span
                key={p.id}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  done ? "bg-grass/15 text-grass" : "border border-pitch-line text-ink-faint"
                }`}
              >
                {p.name} {done ? "✓" : "…"}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-pitch-line pt-3">
          {mini.actual ? (
            <p className="text-center text-sm text-ink">
              실제 스코어{" "}
              <b className="text-gold">
                {mini.actual.a} : {mini.actual.b}
              </b>
            </p>
          ) : (
            <p className="text-center text-xs text-ink-faint">실제 스코어 입력 대기 중…</p>
          )}

          <div className="flex flex-col gap-1.5">
            {mini.guesses.length === 0 && (
              <p className="text-center text-xs text-ink-faint">추측한 사람이 없어요.</p>
            )}
            {mini.guesses
              .slice()
              .sort((x, y) => (nameById.get(x.participantId) ?? "").localeCompare(nameById.get(y.participantId) ?? ""))
              .map((g) => {
                const hit = mini.winners.includes(g.participantId);
                return (
                  <div
                    key={g.participantId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      hit ? "border-grass bg-grass/15 text-grass" : "border-pitch-line text-ink"
                    }`}
                  >
                    <span className="font-display">{g.name}</span>
                    <span className="tabular">
                      {g.a} : {g.b} {hit && "🎯"}
                    </span>
                  </div>
                );
              })}
          </div>

          {mini.actual && mini.winners.length === 0 && (
            <p className="text-center text-xs text-ink-faint">정확히 맞힌 사람이 없어요. 😅</p>
          )}
        </div>
      )}
    </Card>
  );
}

function ScoreColumn({
  team,
  value,
  editable,
  busy,
  onStep,
}: {
  team: string;
  value: number;
  editable: boolean;
  busy: boolean;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="line-clamp-1 max-w-full truncate text-center text-sm text-ink">{team}</span>
      <div className="tabular flex items-center justify-center font-display text-4xl text-ink">
        {value}
      </div>
      {editable && (
        <div className="flex items-center gap-2">
          <button
            disabled={busy || value <= 0}
            onClick={() => onStep(-1)}
            className="h-9 w-9 rounded-full border border-pitch-line text-lg text-ink disabled:opacity-30"
          >
            −
          </button>
          <button
            disabled={busy || value >= 50}
            onClick={() => onStep(1)}
            className="h-9 w-9 rounded-full border border-grass/50 bg-grass/10 text-lg text-grass disabled:opacity-30"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
