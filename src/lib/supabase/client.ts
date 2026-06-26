"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저(클라이언트)용 Supabase — anon 공개 키 사용.
// 읽기 위주. 쓰기/관리자 작업은 서버 라우트(service_role)를 통해서만 한다 (§4, §9).
let browserClient: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). 로컬은 .env.local, 배포는 Vercel 환경변수에 설정 후 재배포(Redeploy)하세요."
    );
  }

  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return browserClient;
}
