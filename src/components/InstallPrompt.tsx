"use client";

import { useEffect, useState } from "react";

// beforeinstallprompt 이벤트 타입(표준 타입 미정의라 최소 선언).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "a2hs-dismissed";

// "홈 화면에 추가" 안내/설치.
// - 서비스워커 등록(설치 조건 충족)
// - Android/데스크톱 크롬: beforeinstallprompt 캡처 → 원탭 설치 버튼
// - iOS 사파리: 자동 설치 불가 → 공유→홈화면 안내 배너
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // 서비스워커 등록 (설치 가능 조건)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // 이미 설치(스탠드얼론)면 표시하지 않음
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
    if (isIOS && isSafari) {
      setIos(true);
      setShow(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 미니 배너 막고 우리 UI 사용
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 무시
    }
  };

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
  }

  return (
    <div className="mx-4 mt-2 flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-ink">
      <span className="text-lg">📲</span>
      {ios ? (
        <p className="flex-1 leading-snug">
          홈 화면에 추가하려면 하단의 <b>공유</b> 버튼을 누른 뒤 <b>‘홈 화면에 추가’</b> 를
          선택하세요.
        </p>
      ) : (
        <p className="flex-1 leading-snug">앱처럼 쓰려면 홈 화면에 추가하세요.</p>
      )}

      {!ios && (
        <button
          onClick={install}
          className="shrink-0 rounded-lg bg-gold px-3 py-1.5 font-display text-pitch-base"
        >
          추가
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="닫기"
        className="shrink-0 text-ink-faint hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
