import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, COOKIE_OPTIONS, signSession } from "@/lib/auth";
import { hashPin, isValidPin, verifyPin } from "@/lib/pin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pin = body?.pin;
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "4자리 PIN을 입력하세요." }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: settings } = await sb
    .from("settings")
    .select("admin_pin_hash")
    .eq("id", 1)
    .maybeSingle();

  let firstTime = false;

  if (!settings?.admin_pin_hash) {
    // 최초 진입: 입력한 PIN 을 관리자 PIN 으로 등록 (§4 셋업 때 지정)
    const hash = await hashPin(pin);
    const { error } = await sb
      .from("settings")
      .upsert({ id: 1, admin_pin_hash: hash }, { onConflict: "id" });
    if (error) {
      console.error("관리자 PIN 등록 실패", error);
      return NextResponse.json({ error: "관리자 PIN 등록에 실패했습니다." }, { status: 500 });
    }
    firstTime = true;
  } else {
    const ok = await verifyPin(pin, settings.admin_pin_hash);
    if (!ok) {
      return NextResponse.json({ error: "관리자 PIN이 일치하지 않습니다." }, { status: 401 });
    }
  }

  const res = NextResponse.json({ ok: true, firstTime });
  res.cookies.set(ADMIN_COOKIE, signSession({ role: "admin" }), COOKIE_OPTIONS);
  return res;
}
