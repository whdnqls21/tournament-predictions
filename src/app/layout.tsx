import type { Metadata, Viewport } from "next";
import { Do_Hyeon, Noto_Sans_KR, Oswald } from "next/font/google";

import "./globals.css";
import FieldBackground from "@/components/FieldBackground";
import BottomTabs from "@/components/BottomTabs";
import AppHeader from "@/components/AppHeader";
import InstallPrompt from "@/components/InstallPrompt";

// §6 디자인 토큰 — 폰트
const display = Do_Hyeon({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const numeric = Oswald({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-numeric",
  display: "swap",
});

export const metadata: Metadata = {
  title: "축잘알 토너먼트",
  description: "2026 FIFA 북중미 월드컵 친목 예측 내기 — 윤·준·경·빈",
  applicationName: "축잘알 토너먼트",
  // 매니페스트는 app/manifest.ts 가 자동 연결. 아이콘은 명시 지정
  // (apple = app/apple-icon.tsx 가 생성하는 PNG 라우트).
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon",
  },
  // iOS 사파리: "홈 화면에 추가" 시 앱처럼(standalone) 실행되도록
  appleWebApp: {
    capable: true,
    title: "축잘알",
    statusBarStyle: "black-translucent",
  },
  // iOS 는 standalone 실행에 apple- 접두 메타가 필요하다(Next 는 표준명만 출력하므로 보강).
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c241d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable} ${numeric.variable}`}>
      <body>
        <FieldBackground />
        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
          <AppHeader />
          <InstallPrompt />
          <main className="flex-1 px-4 pb-28 pt-2">{children}</main>
          <BottomTabs />
        </div>
      </body>
    </html>
  );
}
