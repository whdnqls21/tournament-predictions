import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버 전용 Supabase — service_role 키 사용 (RLS 우회).
// 이 키는 절대 클라이언트로 노출하면 안 된다 (NEXT_PUBLIC_ 금지). §4, §9.
// 관리자 행위(결과 입력·되돌리기·강제 마감·PIN 재설정)와
// 예측 가림 규칙(마감 전 남의 예측 숨김)을 서버에서 적용할 때 사용한다.
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Supabase 서버 환경변수 누락: ${missing}. 로컬은 .env.local, 배포는 Vercel 환경변수에 설정 후 재배포(Redeploy)하세요.`
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
