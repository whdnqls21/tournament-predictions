"use client";

// 클라이언트에서 서버 라우트로 JSON POST. 에러 메시지는 한글로 throw.
export async function postJSON<T = unknown>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 무시 — 아래에서 기본 메시지 처리
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "요청에 실패했습니다.";
    throw new Error(message);
  }
  return data as T;
}
