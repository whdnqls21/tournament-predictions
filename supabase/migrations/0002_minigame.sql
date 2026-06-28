-- ════════════════════════════════════════════════════════════════════════
-- 마이그레이션 0002 — 미니게임(특정 경기 스코어 맞히기)
-- ────────────────────────────────────────────────────────────────────────
-- 메인 게임(승자 예측)과 별개. 현재 회차 1개만 운영한다.
-- 관리자가 브라켓 경기 중 하나를 대상으로 지정(settings.mini_match_id)하고,
-- 참가자는 정확 스코어를 추측한다(mini_predictions). 경기 시작 시간이 지나면
-- 마감되고(메인과 동일한 matches.starts_at 기준), 관리자가 실제 스코어를 입력하면
-- 정확히 맞힌 사람이 적중자가 된다.
-- 실행: Supabase SQL Editor 에 붙여넣고 Run. 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════

-- 현재 미니게임 대상 경기 + 실제 스코어 (settings 단일 행에 보관)
alter table public.settings
  add column if not exists mini_match_id  uuid references public.matches(id) on delete set null,
  add column if not exists mini_home_score int,
  add column if not exists mini_away_score int;

-- 참가자별 스코어 추측 (경기 단위로 분리 저장)
create table if not exists public.mini_predictions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  match_id       uuid not null references public.matches(id) on delete cascade,
  a_score        int not null,   -- team_a(홈) 예측 득점
  b_score        int not null,   -- team_b(원정) 예측 득점
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint mini_predictions_unique unique (participant_id, match_id),
  constraint mini_scores_range check (
    a_score between 0 and 50 and b_score between 0 and 50
  )
);

create index if not exists mini_predictions_match_idx on public.mini_predictions (match_id);

-- RLS: 잠그고 서버(service_role)에서만 접근 (예측 테이블과 동일 정책)
alter table public.mini_predictions enable row level security;

drop trigger if exists mini_predictions_set_updated_at on public.mini_predictions;
create trigger mini_predictions_set_updated_at
  before update on public.mini_predictions
  for each row execute function public.set_updated_at();
