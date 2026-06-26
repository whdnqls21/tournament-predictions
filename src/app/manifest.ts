import type { MetadataRoute } from "next";

// 웹 앱 매니페스트 — Android 크롬 등에서 "홈 화면에 추가" 시 앱처럼 실행(standalone)되게 한다.
// Next 가 자동으로 /manifest.webmanifest 로 서빙하고 <link rel="manifest"> 를 삽입한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "축잘알 토너먼트",
    short_name: "축잘알",
    description: "2026 FIFA 북중미 월드컵 친목 예측 내기 — 윤·준·경·빈",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c241d",
    theme_color: "#0c241d",
    lang: "ko",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // Android 설치(beforeinstallprompt) 조건: 192·512 PNG 필요.
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
