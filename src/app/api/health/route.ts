import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 배포 점검용. <배포주소>/api/health 로 접속해 환경변수/DB 상태를 한눈에 확인.
// 비밀값은 노출하지 않는다 (키는 true/false 만, URL 은 어차피 공개값).
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  let db: {
    ok: boolean;
    error?: string;
    participants?: number;
    settingsRow?: boolean;
    hint?: string;
  } = { ok: false };

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    db = {
      ok: false,
      error: "환경변수 누락으로 DB 확인 생략",
      hint: "Vercel 환경변수에 3개를 모두 넣고 Redeploy 하세요.",
    };
  } else {
    try {
      const sb = createServiceClient();
      const [{ data: parts, error: pErr }, { data: setting, error: sErr }] = await Promise.all([
        sb.from("participants").select("id"),
        sb.from("settings").select("id").eq("id", 1).maybeSingle(),
      ]);
      if (pErr || sErr) {
        const msg = pErr?.message ?? sErr?.message ?? "쿼리 실패";
        db = {
          ok: false,
          error: msg,
          hint: /relation|does not exist|schema cache|not find the table/i.test(msg)
            ? "테이블이 없습니다. Supabase SQL Editor 에서 supabase/schema.sql 을 실행하세요."
            : "Supabase URL/키 값이 올바른지 확인하세요.",
        };
      } else {
        const count = parts?.length ?? 0;
        db = {
          ok: count > 0 && !!setting,
          participants: count,
          settingsRow: !!setting,
          hint:
            count === 0
              ? "테이블은 있는데 시드(참가자 4명)가 없습니다. schema.sql 의 insert 부분을 실행하세요."
              : undefined,
        };
      }
    } catch (e) {
      db = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        hint: "Supabase 연결 실패. URL/키 값을 확인하세요.",
      };
    }
  }

  const ok =
    !!env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    db.ok;

  return NextResponse.json({ ok, env, db }, { status: ok ? 200 : 503 });
}
