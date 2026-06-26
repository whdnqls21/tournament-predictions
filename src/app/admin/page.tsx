"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { postJSON } from "@/lib/client-api";
import { ROUNDS, type RoundKey } from "@/lib/rounds";
import type { AdminState } from "@/lib/state";
import { isoToLocalInput, localInputToIso } from "@/lib/time";
import { matchClosed, matchesInRound } from "@/lib/tournament";
import type { Match } from "@/lib/types";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/state", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        setAdmin(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "오류");
      setAuthed(true);
      setAdmin(data as AdminState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pt-1">
        <h1 className="font-display text-2xl text-ink">관리자</h1>
        <Link href="/" className="text-xs text-ink-dim hover:text-grass">
          ← 앱으로
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {authed === null && <Spinner />}
      {authed === false && <AdminLogin onDone={load} />}
      {authed && admin && <Dashboard admin={admin} reload={load} />}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center pt-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-pitch-line border-t-grass" />
    </div>
  );
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit() {
    if (pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postJSON<{ firstTime: boolean }>("/api/admin/login", { pin });
      if (r.firstTime) setNote("이 PIN이 관리자 PIN으로 등록되었습니다.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-4">
      <div className="text-center">
        <span className="text-2xl">🔐</span>
        <h2 className="mt-1 font-display text-lg text-ink">관리자 PIN</h2>
        <p className="mt-1 text-xs text-ink-faint">
          처음이면 입력한 PIN이 관리자 PIN으로 설정됩니다.
        </p>
      </div>
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="••••"
        className="tabular w-full rounded-xl border border-pitch-line bg-black/20 px-4 py-3 text-center text-2xl tracking-[0.5em] text-ink outline-none focus:border-gold"
      />
      <button
        onClick={submit}
        disabled={pin.length !== 4 || busy}
        className="rounded-xl bg-gold py-3 font-display text-lg text-pitch-base disabled:opacity-40"
      >
        {busy ? "확인 중…" : "진입"}
      </button>
      {note && <p className="text-center text-sm text-grass">{note}</p>}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </Card>
  );
}

function Dashboard({ admin, reload }: { admin: AdminState; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReSetup, setShowReSetup] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => run(() => postJSON("/api/admin/logout", {}))}
          className="rounded-full border border-pitch-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
        >
          관리자 로그아웃
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {!admin.setupDone ? (
        <SetupForm admin={admin} run={run} busy={busy} force={false} />
      ) : (
        <>
          <PinManager admin={admin} run={run} busy={busy} />
          <RoundControl admin={admin} run={run} busy={busy} />
          <UndoCard admin={admin} run={run} busy={busy} />

          <Card className="flex flex-col gap-2">
            <button
              onClick={() => setShowReSetup((v) => !v)}
              className="text-left text-sm text-ink-dim"
            >
              {showReSetup ? "▲ 대회 다시 셋업 닫기" : "▼ 대회 다시 셋업 (초기화)"}
            </button>
            {showReSetup && (
              <>
                <p className="text-xs text-danger">
                  ⚠️ 다시 셋업하면 모든 예측·결과가 삭제됩니다.
                </p>
                <SetupForm admin={admin} run={run} busy={busy} force />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PinManager({
  admin,
  run,
  busy,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [pins, setPins] = useState<Record<string, string>>({});
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-lg text-ink">참가자 PIN</h2>
      <div className="flex flex-col gap-2">
        {admin.participants.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-10 font-display text-ink">{p.name}</span>
            <span
              className={`text-xs ${p.hasPin ? "text-grass" : "text-ink-faint"}`}
            >
              {p.hasPin ? "설정됨" : "미설정"}
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              value={pins[p.id] ?? ""}
              onChange={(e) =>
                setPins((s) => ({
                  ...s,
                  [p.id]: e.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
              placeholder="새 4자리"
              className="tabular ml-auto w-24 rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-center text-ink outline-none focus:border-grass"
            />
            <button
              disabled={busy || (pins[p.id] ?? "").length !== 4}
              onClick={() =>
                run(async () => {
                  await postJSON("/api/admin/action", {
                    action: "pin",
                    participantId: p.id,
                    pin: pins[p.id],
                  });
                  setPins((s) => ({ ...s, [p.id]: "" }));
                })
              }
              className="rounded-lg bg-grass/90 px-3 py-1.5 text-xs text-pitch-base disabled:opacity-40"
            >
              저장
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RoundControl({
  admin,
  run,
  busy,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const rounds = admin.activeRounds;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-ink">라운드 진행</h2>
      {rounds.length === 0 && (
        <p className="text-sm text-ink-dim">진행할 라운드가 없습니다.</p>
      )}
      {rounds.map((round) => (
        <RoundBlock key={round} round={round} admin={admin} run={run} busy={busy} />
      ))}
    </Card>
  );
}

function RoundBlock({
  round,
  admin,
  run,
  busy,
}: {
  round: RoundKey;
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const matches = matchesInRound(admin.matches, round);
  const resulted = matches.length > 0 && matches.every((m) => m.winner);

  return (
    <div className="rounded-xl border border-pitch-line bg-black/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-base text-ink">{ROUNDS[round].label}</span>
        <span className="text-xs text-ink-faint">{resulted ? "결과 완료" : "진행 중"}</span>
      </div>

      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchAdminRow key={m.id} match={m} admin={admin} run={run} busy={busy} />
        ))}
      </div>

      <button
        disabled={busy}
        onClick={() => run(() => postJSON("/api/admin/action", { action: "lock", round }))}
        className="mt-2 w-full rounded-lg border border-gold/50 bg-gold/10 py-2 text-xs text-gold disabled:opacity-40"
      >
        🔒 이 라운드 즉시 강제 마감 (시간과 무관하게)
      </button>
    </div>
  );
}

function MatchAdminRow({
  match,
  admin,
  run,
  busy,
}: {
  match: Match;
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [when, setWhen] = useState(isoToLocalInput(match.starts_at));
  const closed = matchClosed(match, Date.now());
  const saved = admin.savedByMatch?.[match.id] ?? [];

  return (
    <div className="rounded-lg border border-pitch-line bg-black/10 p-2.5">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="truncate font-display text-ink">
          {match.team_a ?? "미정"} <span className="text-ink-faint">vs</span>{" "}
          {match.team_b ?? "미정"}
        </span>
        <span className={closed ? "text-gold" : "text-ink-faint"}>
          {match.winner ? "결과 완료" : closed ? "🔒 마감" : "예측 중"}
        </span>
      </div>

      {/* 시작 시간 설정 */}
      <div className="mb-2 flex items-center gap-2">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="tabular w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-xs text-ink outline-none focus:border-grass"
        />
        <button
          disabled={busy}
          onClick={() =>
            run(() =>
              postJSON("/api/admin/action", {
                action: "schedule",
                matchId: match.id,
                startsAt: localInputToIso(when),
              })
            )
          }
          className="shrink-0 rounded-lg bg-grass/90 px-3 py-1.5 text-xs text-pitch-base disabled:opacity-40"
        >
          시간 저장
        </button>
      </div>

      {/* 마감 전: 누가 저장했는지 / 마감 후: 진출 팀 선택 */}
      {!closed ? (
        <div className="flex flex-wrap gap-1.5">
          {admin.participants.map((p) => (
            <span
              key={p.id}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                saved.includes(p.id)
                  ? "bg-grass/15 text-grass"
                  : "border border-pitch-line text-ink-faint"
              }`}
            >
              {p.name} {saved.includes(p.id) ? "저장✓" : "…"}
            </span>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[match.team_a, match.team_b].map((team, idx) =>
            team ? (
              <button
                key={team}
                disabled={busy}
                onClick={() =>
                  run(() =>
                    postJSON("/api/admin/action", {
                      action: "result",
                      matchId: match.id,
                      winner: team,
                    })
                  )
                }
                className={`truncate rounded-lg border py-2 text-sm disabled:opacity-40 ${
                  match.winner === team
                    ? "border-grass bg-grass/15 text-grass"
                    : "border-pitch-line text-ink hover:border-grass/40"
                }`}
              >
                {team}
                {match.winner === team && " ✓"}
              </button>
            ) : (
              <div
                key={idx}
                className="rounded-lg border border-dashed border-pitch-line"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function UndoCard({
  admin,
  run,
  busy,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const anyResult = admin.matches.some((m) => m.winner);
  if (!anyResult) return null;
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-display text-base text-ink">결과 되돌리기</h2>
      <p className="text-xs text-ink-faint">
        가장 최근에 결과를 입력한 라운드를 미입력 상태로 되돌립니다. 그 아래로 자동 생성된 다음
        라운드(대진·예측)는 초기화됩니다.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          if (confirm("가장 최근 라운드 결과를 되돌릴까요?")) {
            run(() => postJSON("/api/admin/action", { action: "undo" }));
          }
        }}
        className="rounded-lg border border-danger/50 bg-danger/10 py-2 text-sm text-danger disabled:opacity-40"
      >
        ↩ 최근 라운드 되돌리기
      </button>
    </Card>
  );
}

function SetupForm({
  admin,
  run,
  busy,
  force,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  force: boolean;
}) {
  const [matchups, setMatchups] = useState<string[][]>(
    Array.from({ length: 16 }, () => ["", ""])
  );
  const [starts, setStarts] = useState<string[]>(Array.from({ length: 16 }, () => ""));
  const [pins, setPins] = useState<Record<string, string>>({});

  const allFilled = matchups.every((p) => p[0].trim() && p[1].trim());

  const setTeam = (i: number, side: 0 | 1, value: string) =>
    setMatchups((s) => {
      const next = s.map((p) => [...p]);
      next[i][side] = value;
      return next;
    });

  const setStart = (i: number, value: string) =>
    setStarts((s) => {
      const next = [...s];
      next[i] = value;
      return next;
    });

  return (
    <Card className="flex flex-col gap-4">
      {!force && (
        <div>
          <h2 className="font-display text-lg text-ink">32강 대진 셋업</h2>
          <p className="mt-1 text-xs text-ink-faint">
            16경기의 두 팀과 시작 시간을 입력하세요. (브라켓 위→아래 순서) 시간은 선택이며,
            지정하면 그 시각에 예측이 자동 마감됩니다.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {matchups.map((pair, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-pitch-line/60 p-2">
            <div className="flex items-center gap-2">
              <span className="w-7 text-right text-xs text-ink-faint">{i + 1}</span>
              <input
                value={pair[0]}
                onChange={(e) => setTeam(i, 0, e.target.value)}
                placeholder="팀 A"
                className="w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-sm text-ink outline-none focus:border-grass"
              />
              <span className="text-xs text-ink-faint">vs</span>
              <input
                value={pair[1]}
                onChange={(e) => setTeam(i, 1, e.target.value)}
                placeholder="팀 B"
                className="w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-sm text-ink outline-none focus:border-grass"
              />
            </div>
            <div className="flex items-center gap-2 pl-9">
              <span className="text-[11px] text-ink-faint">시작</span>
              <input
                type="datetime-local"
                value={starts[i]}
                onChange={(e) => setStart(i, e.target.value)}
                className="tabular w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-xs text-ink outline-none focus:border-grass"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-pitch-line pt-3">
        <p className="text-sm text-ink-dim">참가자 PIN (선택 — 나중에 설정 가능)</p>
        {admin.participants.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-10 font-display text-ink">{p.name}</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              value={pins[p.id] ?? ""}
              onChange={(e) =>
                setPins((s) => ({
                  ...s,
                  [p.id]: e.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
              placeholder="4자리"
              className="tabular ml-auto w-24 rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-center text-ink outline-none focus:border-grass"
            />
          </div>
        ))}
      </div>

      <button
        disabled={busy || !allFilled}
        onClick={() =>
          run(() =>
            postJSON("/api/admin/action", {
              action: "setup",
              matchups,
              starts: starts.map((v) => localInputToIso(v)),
              pins,
              force,
            })
          )
        }
        className="rounded-xl bg-grass py-3 font-display text-lg text-pitch-base disabled:opacity-40"
      >
        {allFilled ? (force ? "초기화하고 다시 셋업" : "대회 시작!") : "16경기를 모두 입력하세요"}
      </button>
    </Card>
  );
}
