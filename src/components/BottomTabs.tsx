"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 하단 탭 — 예측 · 대진표 · 순위 · 미니게임 (모바일 우선, §6)
const TABS = [
  { href: "/", label: "예측", icon: PredictIcon },
  { href: "/bracket", label: "대진표", icon: BracketIcon },
  { href: "/ranking", label: "순위", icon: RankIcon },
  { href: "/minigame", label: "미니게임", icon: MiniIcon },
] as const;

export default function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto max-w-md px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-stretch justify-around rounded-2xl border border-pitch-line bg-pitch-base/90 shadow-card backdrop-blur-md">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  active ? "text-grass" : "text-ink-faint hover:text-ink-dim"
                }`}
              >
                <Icon active={active} />
                <span className={active ? "font-medium" : ""}>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

type IconProps = { active?: boolean };

function PredictIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function BracketIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h5v6h4M4 13h5" />
      <path d="M4 19h5v-6" />
      <path d="M13 11h3M13 13h3" />
      <path d="M16 9v6h4" />
    </svg>
  );
}

function RankIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 21V11M12 21V4M18 21v-7" />
    </svg>
  );
}

function MiniIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
