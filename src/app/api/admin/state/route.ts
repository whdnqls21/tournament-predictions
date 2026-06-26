import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/auth";
import { buildAdminState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  try {
    const state = await buildAdminState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("GET /api/admin/state 실패", err);
    return NextResponse.json({ error: "상태를 불러오지 못했습니다." }, { status: 500 });
  }
}
