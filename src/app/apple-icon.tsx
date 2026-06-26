import { ImageResponse } from "next/og";

// iOS "홈 화면에 추가" 용 아이콘 (apple-touch-icon). PNG 로 생성 — 폰트 없이 도형만 사용.
// 앱의 축구장 테마(센터서클 + 골드)와 통일. Next 가 <link rel="apple-touch-icon"> 자동 삽입.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        {/* 센터 서클 (잔디 그린) */}
        <div
          style={{
            width: 124,
            height: 124,
            borderRadius: 9999,
            border: "11px solid #46e08a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* 센터 도트 (트로피 골드) */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: "#f4c64e",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
