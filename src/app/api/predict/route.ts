import { NextResponse, type NextRequest } from "next/server";

import { getParticipantSession } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { matchClosed } from "@/lib/tournament";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const sb = createServiceClient();

  // ── 한 경기 픽 = 즉시 저장(확정). 시작 시간 전까지는 다시 눌러 변경 가능. ──
  if (action === "pick") {
    const matchId = body?.matchId;
    const pickedTeam = body?.pickedTeam;
    if (typeof matchId !== "string" || typeof pickedTeam !== "string") {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { data: matchData } = await sb
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    const match = matchData as Match | null;
    if (!match) return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 });
    if (!match.team_a || !match.team_b)
      return NextResponse.json({ error: "아직 열리지 않은 경기입니다." }, { status: 400 });
    if (matchClosed(match, Date.now()))
      return NextResponse.json(
        { error: "경기가 시작되어 예측이 마감되었습니다." },
        { status: 403 }
      );
    if (pickedTeam !== match.team_a && pickedTeam !== match.team_b)
      return NextResponse.json({ error: "두 팀 중 하나만 선택할 수 있습니다." }, { status: 400 });

    // 탭 즉시 저장 → confirmed = true (마감 전까지 다른 팀으로 갱신 가능)
    const { error } = await sb.from("predictions").upsert(
      {
        participant_id: session.id,
        match_id: matchId,
        picked_team: pickedTeam,
        confirmed: true,
      },
      { onConflict: "participant_id,match_id" }
    );
    if (error) {
      console.error("pick upsert 실패", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
}
