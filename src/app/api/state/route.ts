import { NextResponse } from "next/server";

import { buildParticipantState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await buildParticipantState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("GET /api/state 실패", err);
    return NextResponse.json(
      { error: "상태를 불러오지 못했습니다. 환경변수/DB 설정을 확인하세요." },
      { status: 500 }
    );
  }
}
