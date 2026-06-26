import Link from "next/link";

// 상단 헤더 — 앱 타이틀 + 관리자 진입.
export default function AppHeader() {
  return (
    <header className="sticky top-0 z-20 -mb-px flex items-center justify-between bg-gradient-to-b from-pitch-base via-pitch-base/95 to-transparent px-4 pb-3 pt-4 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-2xl leading-none">🏆</span>
        <span className="font-display text-xl tracking-tight text-ink">
          축잘알 <span className="text-grass">토너먼트</span>
        </span>
      </Link>
      <Link
        href="/admin"
        className="rounded-full border border-pitch-line px-3 py-1 text-xs text-ink-dim transition-colors hover:border-gold/50 hover:text-gold"
      >
        관리자
      </Link>
    </header>
  );
}
