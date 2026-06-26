// 최소 서비스워커 — "홈 화면에 추가"(PWA 설치) 조건 충족용.
// 캐싱은 하지 않는다(동적 앱이라 항상 최신 유지). fetch 핸들러만 둔다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // respondWith 를 호출하지 않아 브라우저 기본(네트워크) 동작을 그대로 사용.
});
