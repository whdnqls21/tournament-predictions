import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_OPTIONS, PARTICIPANT_COOKIE, signSession } from "@/lib/auth";
import { isValidPin, verifyPin } from "@/lib/pin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  const pin = body?.pin;

  if (!name || !isValidPin(pin)) {
    return NextResponse.json({ error: "이름과 4자리 PIN을 확인하세요." }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: part } = await sb
    .from("participants")
    .select("id,name,pin_hash")
    .eq("name", name)
    .maybeSingle();

  if (!part) {
    return NextResponse.json({ error: "참가자를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!part.pin_hash) {
    return NextResponse.json(
      { error: "PIN이 아직 설정되지 않았습니다. 관리자에게 문의하세요." },
      { status: 403 }
    );
  }

  const ok = await verifyPin(pin, part.pin_hash);
  if (!ok) {
    return NextResponse.json({ error: "PIN이 일치하지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, name: part.name });
  res.cookies.set(
    PARTICIPANT_COOKIE,
    signSession({ role: "participant", id: part.id, name: part.name }),
    COOKIE_OPTIONS
  );
  return res;
}
