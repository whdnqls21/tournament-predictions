// 축구장 라인 — 화면 뒤에 고정. 흰색 5~8% 투명도로 은은하게 (§6).
export default function FieldBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <svg
        className="absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 100 100"
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="0.35"
      >
        {/* 센터 라인 */}
        <line x1="0" y1="50" x2="100" y2="50" />
        {/* 센터 서클 */}
        <circle cx="50" cy="50" r="13" />
        <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.06)" stroke="none" />
        {/* 위/아래 페널티 박스 */}
        <rect x="28" y="0" width="44" height="14" />
        <rect x="40" y="0" width="20" height="6" />
        <rect x="28" y="86" width="44" height="14" />
        <rect x="40" y="94" width="20" height="6" />
      </svg>
      {/* 상단 골드 글로우 (트로피 느낌) */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(244,198,78,0.10),transparent)]" />
    </div>
  );
}
