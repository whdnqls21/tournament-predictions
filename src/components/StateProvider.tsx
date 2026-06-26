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
  }, [refresh]);

  return <Ctx.Provider value={{ state, loading, error, refresh }}>{children}</Ctx.Provider>;
}
