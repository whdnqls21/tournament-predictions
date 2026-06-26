import { ImageResponse } from "next/og";

// 매니페스트용 PNG 아이콘 생성 (Android 설치 조건: 192·512 PNG 필요).
// 축구장 테마(센터서클 + 골드 도트). maskable 안전영역 위해 여백 충분히.
export function appIconResponse(size: number): ImageResponse {
  const circle = Math.round(size * 0.58);
  const border = Math.max(6, Math.round(size * 0.06));
  const dot = Math.round(size * 0.15);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0e2a21 0%, #0c241d 100%)",
        }}
      >
        <div
          style={{
            width: circle,
            height: circle,
            borderRadius: 9999,
            border: `${border}px solid #46e08a`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: dot, height: dot, borderRadius: 9999, background: "#f4c64e" }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
