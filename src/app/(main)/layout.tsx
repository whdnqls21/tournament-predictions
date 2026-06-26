"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/Card";
import LoginScreen from "@/components/LoginScreen";
import { StateProvider, useAppState } from "@/components/StateProvider";

function Gate({ children }: { children: ReactNode }) {
  const { state, loading, error } = useAppState();

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 pt-20 text-ink-dim">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-pitch-line border-t-grass" />
        <p className="text-sm">불러오는 중…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mt-8 flex flex-col items-center gap-2 py-10 text-center">
        <p className="font-display text-lg text-danger">문제가 생겼어요</p>
        <p className="text-sm text-ink-dim">{error}</p>
        <p className="text-xs text-ink-faint">환경변수(.env)와 Supabase 설정을 확인하세요.</p>
      </Card>
    );
  }

  if (!state?.setupDone) {
    return (
      <Card className="mt-8 flex flex-col items-center gap-3 py-10 text-center">
        <span className="text-3xl">🏗️</span>
        <h2 className="font-display text-lg text-ink">아직 대회가 준비되지 않았어요</h2>
        <p className="max-w-[18rem] text-sm text-ink-dim">
          관리자가 32강 대진을 셋업하면 예측을 시작할 수 있어요.
        </p>
        <Link
          href="/admin"
          className="mt-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
        >
          관리자로 셋업하기 →
        </Link>
      </Card>
    );
  }

  if (!state.session) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <StateProvider>
      <Gate>{children}</Gate>
    </StateProvider>
  );
}
