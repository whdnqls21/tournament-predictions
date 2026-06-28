"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { postJSON } from "@/lib/client-api";
import { ROUNDS, type RoundKey } from "@/lib/rounds";
import type { AdminState } from "@/lib/state";
import { formatKickoff, isoToLocalInput, localInputToIso } from "@/lib/time";
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

      <PinManager admin={admin} run={run} busy={busy} />
      <Setup32 admin={admin} run={run} busy={busy} />
      <RoundControl admin={admin} run={run} busy={busy} />
      <MiniGameAdmin admin={admin} run={run} busy={busy} />
      <UndoCard admin={admin} run={run} busy={busy} />

      <Card className="flex flex-col gap-2">
        <button
          onClick={() => setShowReSetup((v) => !v)}
          className="text-left text-sm text-ink-dim"
        >
          {showReSetup ? "▲ 대회 초기화 닫기" : "▼ 대회 초기화 (전체 삭제)"}
        </button>
        {showReSetup && (
          <>
            <p className="text-xs text-danger">
              ⚠️ 초기화하면 모든 예측·결과·대진이 삭제되고 32강부터 다시 입력합니다.
            </p>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm("정말 초기화할까요? 모든 예측·결과·대진이 삭제됩니다.")) {
                  run(() => postJSON("/api/admin/action", { action: "reset" }));
                }
              }}
              className="rounded-lg border border-danger/50 bg-danger/10 py-2 text-sm text-danger disabled:opacity-40"
            >
              전체 초기화
            </button>
          </>
        )}
      </Card>
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
  // 32강은 아래 "32강 대진" 섹션에서 다루므로 여기선 16강 이후만.
  const rounds = admin.activeRounds.filter((r) => r !== "R32");
  if (rounds.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-ink">라운드 진행 (16강~)</h2>
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

function Setup32({
  admin,
  run,
  busy,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const r32 = matchesInRound(admin.matches, "R32");
  const bySlot = new Map(r32.map((m) => [m.bracket_slot, m]));
  const savedCount = r32.filter((m) => m.team_a && m.team_b).length;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg text-ink">
          32강 대진 <span className="text-sm text-grass">{savedCount}/16 저장</span>
        </h2>
        <p className="mt-1 text-xs text-ink-faint">
          경기마다 두 팀과 시작 시간을 입력하고 <b>저장</b>하세요. 저장하면 곧바로 참가자
          예측이 열리고, 시작 시간이 지나면 자동 마감됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 16 }, (_, slot) => (
          <SetupMatchRow
            key={slot}
            slot={slot}
            match={bySlot.get(slot)}
            admin={admin}
            run={run}
            busy={busy}
          />
        ))}
      </div>
    </Card>
  );
}

function SetupMatchRow({
  slot,
  match,
  admin,
  run,
  busy,
}: {
  slot: number;
  match: Match | undefined;
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [teamA, setTeamA] = useState(match?.team_a ?? "");
  const [teamB, setTeamB] = useState(match?.team_b ?? "");
  const [when, setWhen] = useState(isoToLocalInput(match?.starts_at));

  const closed = match ? matchClosed(match, Date.now()) : false;
  const saved = !!(match?.team_a && match?.team_b);
  const dirty =
    teamA !== (match?.team_a ?? "") ||
    teamB !== (match?.team_b ?? "") ||
    when !== isoToLocalInput(match?.starts_at);
  const savedIds = match ? admin.savedByMatch?.[match.id] ?? [] : [];

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-pitch-line/60 p-2">
      <div className="flex items-center gap-2">
        <span className="w-6 text-right text-xs text-ink-faint">{slot + 1}</span>
        <input
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
          disabled={closed}
          placeholder="팀 A"
          className="w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-sm text-ink outline-none focus:border-grass disabled:opacity-60"
        />
        <span className="text-xs text-ink-faint">vs</span>
        <input
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
          disabled={closed}
          placeholder="팀 B"
          className="w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-sm text-ink outline-none focus:border-grass disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-2 pl-8">
        <span className="text-[11px] text-ink-faint">시작</span>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          disabled={closed}
          className="tabular w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-xs text-ink outline-none focus:border-grass disabled:opacity-60"
        />
        <button
          disabled={busy || closed || !teamA.trim() || !teamB.trim() || !dirty}
          onClick={() =>
            run(() =>
              postJSON("/api/admin/action", {
                action: "setupMatch",
                slot,
                teamA,
                teamB,
                startsAt: localInputToIso(when),
              })
            )
          }
          className="shrink-0 rounded-lg bg-grass/90 px-3 py-1.5 text-xs text-pitch-base disabled:opacity-40"
        >
          {saved && !dirty ? "저장됨" : "저장"}
        </button>
      </div>

      {/* 상태: 마감 전엔 예측 저장 현황, 마감 후엔 진출 팀 선택 */}
      {saved &&
        (closed ? (
          <div className="grid grid-cols-2 gap-2 pl-8">
            {[match!.team_a, match!.team_b].map((team, idx) =>
              team ? (
                <button
                  key={team}
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      postJSON("/api/admin/action", {
                        action: "result",
                        matchId: match!.id,
                        winner: team,
                      })
                    )
                  }
                  className={`truncate rounded-lg border py-2 text-sm disabled:opacity-40 ${
                    match!.winner === team
                      ? "border-grass bg-grass/15 text-grass"
                      : "border-pitch-line text-ink hover:border-grass/40"
                  }`}
                >
                  {team}
                  {match!.winner === team && " ✓"}
                </button>
              ) : (
                <div key={idx} className="rounded-lg border border-dashed border-pitch-line" />
              )
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {admin.participants.map((p) => (
              <span
                key={p.id}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  savedIds.includes(p.id)
                    ? "bg-grass/15 text-grass"
                    : "border border-pitch-line text-ink-faint"
                }`}
              >
                {p.name} {savedIds.includes(p.id) ? "저장✓" : "…"}
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}

function MiniGameAdmin({
  admin,
  run,
  busy,
}: {
  admin: AdminState;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const mini = admin.miniGame;
  const candidates = admin.matches.filter((m) => m.team_a && m.team_b);
  const [sel, setSel] = useState("");
  const [home, setHome] = useState(mini?.actual?.a ?? 0);
  const [away, setAway] = useState(mini?.actual?.b ?? 0);

  const clamp = (v: string) => Math.max(0, Math.min(50, Math.floor(Number(v) || 0)));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg text-ink">🎯 미니게임 (스코어 맞히기)</h2>
        <p className="mt-1 text-xs text-ink-faint">
          브라켓 경기 중 하나를 골라 스코어 맞히기 대상으로 지정합니다. 메인 게임 순위와는 별개예요.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="w-full rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-sm text-ink outline-none focus:border-grass"
        >
          <option value="">경기 선택…</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {ROUNDS[m.round].label} · {m.team_a} vs {m.team_b}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !sel}
          onClick={() =>
            run(async () => {
              await postJSON("/api/admin/action", { action: "miniSet", matchId: sel });
              setSel("");
            })
          }
          className="shrink-0 rounded-lg bg-grass/90 px-3 py-1.5 text-xs text-pitch-base disabled:opacity-40"
        >
          지정
        </button>
      </div>

      {!mini ? (
        <p className="text-sm text-ink-dim">지정된 미니게임이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-pitch-line bg-black/10 p-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-ink">
              {mini.teamA} vs {mini.teamB}
            </span>
            <span className="text-xs text-ink-faint">{mini.closed ? "🔒 마감" : "진행 중"}</span>
          </div>
          <span className="text-[11px] text-ink-faint">⏰ {formatKickoff(mini.startsAt)}</span>

          {/* 추측 현황 (관리자는 항상 공개) */}
          <div className="flex flex-col gap-1">
            {admin.participants.map((p) => {
              const g = mini.guesses.find((x) => x.participantId === p.id);
              const hit = mini.winners.includes(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink">{p.name}</span>
                  <span className={`tabular ${hit ? "text-grass" : "text-ink-dim"}`}>
                    {g ? `${g.a} : ${g.b}${hit ? " 🎯" : ""}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 실제 스코어 입력 (마감 후) */}
          {mini.closed && (
            <div className="flex items-center gap-2 border-t border-pitch-line pt-3">
              <span className="text-xs text-ink-dim">실제</span>
              <input
                type="number"
                min={0}
                max={50}
                value={home}
                onChange={(e) => setHome(clamp(e.target.value))}
                className="tabular w-14 rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-center text-ink outline-none focus:border-grass"
              />
              <span className="text-ink-faint">:</span>
              <input
                type="number"
                min={0}
                max={50}
                value={away}
                onChange={(e) => setAway(clamp(e.target.value))}
                className="tabular w-14 rounded-lg border border-pitch-line bg-black/20 px-2 py-1.5 text-center text-ink outline-none focus:border-grass"
              />
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    postJSON("/api/admin/action", {
                      action: "miniResult",
                      homeScore: home,
                      awayScore: away,
                    })
                  )
                }
                className="ml-auto shrink-0 rounded-lg bg-grass/90 px-3 py-1.5 text-xs text-pitch-base disabled:opacity-40"
              >
                스코어 저장
              </button>
            </div>
          )}

          <button
            disabled={busy}
            onClick={() =>
              run(() => postJSON("/api/admin/action", { action: "miniSet", matchId: null }))
            }
            className="text-left text-xs text-danger disabled:opacity-40"
          >
            미니게임 해제
          </button>
        </div>
      )}
    </Card>
  );
}
