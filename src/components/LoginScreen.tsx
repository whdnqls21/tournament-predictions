"use client";

import { useState } from "react";

import { Card } from "@/components/Card";
import { postJSON } from "@/lib/client-api";
import { useAppState } from "@/components/StateProvider";

export default function LoginScreen() {
  const { state, refresh } = useAppState();
  const [name, setName] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const participants = state?.participants ?? [];

  async function submit() {
    if (!name || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      await postJSON("/api/auth/login", { name, pin });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-grass">참가자 로그인</p>
        <h1 className="mt-1 font-display text-2xl text-ink">누구세요?</h1>
      </div>

      <Card className="flex flex-col gap-5">
        <div className="grid grid-cols-4 gap-2">
          {participants.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setName(p.name);
                setPin("");
                setError(null);
              }}
              className={`rounded-xl border py-4 font-display text-xl transition-colors ${
                name === p.name
                  ? "border-grass bg-grass/15 text-grass shadow-glow"
                  : "border-pitch-line text-ink hover:border-grass/40"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {name && (
          <div className="flex flex-col gap-3">
            <label className="text-sm text-ink-dim">
              <span className="font-medium text-ink">{name}</span> 님의 4자리 PIN
            </label>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="••••"
              className="tabular w-full rounded-xl border border-pitch-line bg-black/20 px-4 py-3 text-center text-2xl tracking-[0.5em] text-ink outline-none focus:border-grass"
            />
            <button
              onClick={submit}
              disabled={pin.length !== 4 || busy}
              className="rounded-xl bg-grass py-3 font-display text-lg text-pitch-base transition-opacity disabled:opacity-40"
            >
              {busy ? "확인 중…" : "입장"}
            </button>
          </div>
        )}

        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </Card>

      <p className="text-center text-xs text-ink-faint">
        PIN을 모르면 관리자(빈)에게 문의하세요.
      </p>
    </div>
  );
}
