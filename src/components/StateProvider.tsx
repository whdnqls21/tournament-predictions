"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { ParticipantState } from "@/lib/state";

interface AppStateContext {
  state: ParticipantState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppStateContext | null>(null);

export function useAppState(): AppStateContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppState must be used within StateProvider");
  return c;
}

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ParticipantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "상태를 불러오지 못했습니다.");
      setState(data as ParticipantState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // 경기 시작 시간이 지나면 예측이 자동 마감되므로, 주기적으로 새로고침해
    // 마감/공개 상태를 최신으로 유지한다(탭이 열려 있어도 반영).
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return <Ctx.Provider value={{ state, loading, error, refresh }}>{children}</Ctx.Provider>;
}
