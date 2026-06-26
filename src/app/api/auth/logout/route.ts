import { NextResponse } from "next/server";

import { PARTICIPANT_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PARTICIPANT_COOKIE);
  return res;
}
