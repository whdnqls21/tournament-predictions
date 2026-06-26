// Supabase 테이블 행 타입 (§8 데이터 모델). 스키마는 supabase/schema.sql 참고.
import type { RoundKey } from "@/lib/rounds";

export interface Participant {
  id: string;
  name: string; // 윤 / 준 / 경 / 빈
  display_order: number;
  // pin_hash 는 서버에서만 다루며 클라이언트로 내려보내지 않는다.
  created_at: string;
}

export interface Settings {
  id: number; // 항상 1 (단일 행)
  current_open_round: RoundKey | null;
  setup_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  round: RoundKey;
  bracket_slot: number; // 라운드 내 위치 (R32: 0~15, R16: 0~7, ...)
  team_a: string | null;
  team_b: string | null;
  winner: string | null; // null = 결과 미입력
  is_locked: boolean; // 예측 마감 여부
  created_at: string;
  updated_at: string;
}

export interface Prediction {
  id: string;
  participant_id: string;
  match_id: string;
  picked_team: string;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
}
