import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-pitch-line bg-pitch-card p-4 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

// 단계별 미구현 안내 카드 — Stage 1 셸에서 다음 작업 단계를 보여준다.
export function StageNotice({
  stage,
  title,
  desc,
}: {
  stage: string;
  title: string;
  desc: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
        {stage}
      </span>
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <p className="max-w-[18rem] text-sm leading-relaxed text-ink-dim">{desc}</p>
    </Card>
  );
}
