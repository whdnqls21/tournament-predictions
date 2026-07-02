"use client";

import { useState } from "react";

import { Card } from "@/components/Card";
import { useAppState } from "@/components/StateProvider";
import { ROUND_ORDER, ROUNDS, roundMaxPoints, TOTAL_POINTS } from "@/lib/rounds";

export default function RankingPage() {
  const { state } = useAppState();
  const [open, setOpen] = useState<string | null>(null);
  if (!state) return null;

  const standings = state.standings;
  const gifts = state.gifts;

  // 선물: 주는 사람별로 묶기
  const giftsByGiver = new Map<string, { name: string; receivers: string[] }>();
  for (const g of gifts) {
    const entry = giftsByGiver.get(g.giverId) ?? { name: g.giverName, receivers: [] };
    entry.receivers.push(g.receiverName);
    giftsByGiver.set(g.giverId, entry);
  }
  const receivedCount = new Map<string, number>();
  for (const g of gifts) {
    receivedCount.set(g.receiverName, (receivedCount.get(g.receiverName) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1">
        <p className="text-xs uppercase tracking-[0.2em] text-grass">순위</p>
        <h1 className="font-display text-2xl text-ink">리더보드</h1>
      </div>

      <ScoringGuide />

      {/* 리더보드 */}
      <div className="flex flex-col gap-2">
        {standings.map((s) => {
          const isFirst = s.rank === 1;
          const expanded = open === s.participantId;
          return (
            <Card
              key={s.participantId}
              className={isFirst ? "border-gold/50 shadow-glow" : ""}
            >
              <button
                onClick={() => setOpen(expanded ? null : s.participantId)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg ${
                    isFirst
                      ? "bg-gold/20 text-gold"
                      : "bg-pitch-line text-ink-dim"
                  }`}
                >
                  {s.rank}
                </span>
                <span className="flex-1 font-display text-lg text-ink">
                  {s.name}
                  {isFirst && <span className="ml-1">👑</span>}
                </span>
                <span className="tabular text-right">
                  <span className="font-display text-2xl text-grass">{s.total}</span>
                  <span className="text-xs text-ink-faint"> / {TOTAL_POINTS}</span>
                </span>
                <span className="ml-1 text-ink-faint">{expanded ? "▲" : "▼"}</span>
              </button>

              {expanded && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-pitch-line pt-3 text-center text-xs">
                  {ROUND_ORDER.map((r) => (
                    <div key={r} className="rounded-lg bg-black/15 py-2">
                      <div className="text-ink-faint">{ROUNDS[r].label}</div>
                      <div className="tabular mt-0.5 text-base text-ink">
                        {s.perRound[r]}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 선물 정산 */}
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">
          선물 정산 <span className="text-sm text-ink-faint">🎁 수수께끼 스킨</span>
        </h2>
        {gifts.length === 0 ? (
          <p className="text-sm text-ink-dim">
            아직 정산할 선물이 없어요. (점수 차가 나면 자동 계산돼요)
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {standings.map((s) => {
                const give = giftsByGiver.get(s.participantId);
                if (!give || give.receivers.length === 0) return null;
                return (
                  <li
                    key={s.participantId}
                    className="flex items-center justify-between rounded-xl bg-black/15 px-3 py-2 text-sm"
                  >
                    <span className="text-ink">
                      <span className="text-ink-faint">{s.rank}등</span> {s.name}
                    </span>
                    <span className="text-right text-ink-dim">
                      → {give.receivers.join(" · ")}{" "}
                      <span className="tabular text-gold">{give.receivers.length}개</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-pitch-line pt-2 text-xs text-ink-faint">
              받는 개수:{" "}
              {standings
                .filter((s) => (receivedCount.get(s.name) ?? 0) > 0)
                .map((s) => `${s.name} ${receivedCount.get(s.name)}개`)
                .join(" · ") || "없음"}
            </div>
          </>
        )}
        <p className="text-[11px] text-ink-faint">
          규칙: 자기보다 위 등수인 사람 각각에게 1개씩. 동순위끼리는 주고받지 않아요.
        </p>
      </Card>
    </div>
  );
}

function ScoringGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between text-left"
      >
        <span className="font-display text-base text-ink">📖 배점 안내</span>
        <span className="text-xs text-ink-faint">
          전체 {TOTAL_POINTS}점 {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-xl border border-pitch-line">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 bg-black/20 px-3 py-1.5 text-[11px] text-ink-faint">
              <span>라운드</span>
              <span className="text-right">경기당</span>
              <span className="text-right">라운드 만점</span>
            </div>
            {ROUND_ORDER.map((r) => (
              <div
                key={r}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-t border-pitch-line px-3 py-1.5 text-sm"
              >
                <span className="text-ink">
                  {ROUNDS[r].label}{" "}
                  <span className="text-[11px] text-ink-faint">({ROUNDS[r].matches}경기)</span>
                </span>
                <span className="tabular text-right text-grass">{ROUNDS[r].pointsPerMatch}점</span>
                <span className="tabular text-right text-ink-dim">{roundMaxPoints(r)}점</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-pitch-line bg-black/20 px-3 py-1.5 text-sm">
              <span className="font-display text-ink">전체 만점</span>
              <span className="tabular text-right font-display text-gold">{TOTAL_POINTS}점</span>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-faint">
            각 경기에서 <b className="text-ink-dim">확정한 픽이 승자와 일치하면</b> 그 라운드 경기당
            점수를 얻어요. 라운드가 올라갈수록 배점이 커집니다.
            <br />
            동점 시: 총점 → <b className="text-ink-dim">우승팀 적중</b> → 결승 진출 2팀 적중 수 순으로
            가립니다.
          </p>
        </div>
      )}
    </Card>
  );
}
