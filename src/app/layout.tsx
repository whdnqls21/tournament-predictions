import type { Metadata, Viewport } from "next";
import { Do_Hyeon, Noto_Sans_KR, Oswald } from "next/font/google";

import "./globals.css";
import FieldBackground from "@/components/FieldBackground";
import BottomTabs from "@/components/BottomTabs";
import AppHeader from "@/components/AppHeader";

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
          <main className="flex-1 px-4 pb-28 pt-2">{children}</main>
          <BottomTabs />
        </div>
      </body>
    </html>
  );
}
