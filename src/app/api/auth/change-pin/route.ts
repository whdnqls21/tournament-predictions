import { NextResponse, type NextRequest } from "next/server";

import { getParticipantSession } from "@/lib/auth";
import { hashPin, isValidPin, verifyPin } from "@/lib/pin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 참가자가 자기 PIN 을 직접 변경한다. 현재 PIN 확인 후 새 PIN 으로 교체.
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPin = body?.currentPin;
  const newPin = body?.newPin;

  if (!isValidPin(currentPin) || !isValidPin(newPin)) {
    return NextResponse.json({ error: "4자리 PIN을 정확히 입력하세요." }, { status: 400 });
  }
  if (currentPin === newPin) {
    return NextResponse.json({ error: "현재 PIN과 다른 PIN을 입력하세요." }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: part } = await sb
    .from("participants")
    .select("id,pin_hash")
    .eq("id", session.id)
    .maybeSingle();

  if (!part) {
    return NextResponse.json({ error: "참가자를 찾을 수 없습니다." }, { status: 404 });
  }
  const ok = await verifyPin(currentPin, part.pin_hash);
  if (!ok) {
    return NextResponse.json({ error: "현재 PIN이 일치하지 않습니다." }, { status: 401 });
  }

  const hash = await hashPin(newPin);
  const { error } = await sb
    .from("participants")
    .update({ pin_hash: hash })
    .eq("id", session.id);
  if (error) {
    console.error("PIN 변경 실패", error);
    return NextResponse.json({ error: "PIN 변경에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
