-- ════════════════════════════════════════════════════════════════════════
-- 마이그레이션 0003 — 미니게임 여러 개 동시 운영
-- ────────────────────────────────────────────────────────────────────────
-- 기존엔 settings.mini_match_id 1칸으로 1개만 운영했다. 이제 활성 미니게임을
-- mini_games 테이블(경기별 1행)로 관리해 무제한으로 띄울 수 있다.
-- 추측(mini_predictions)은 이미 경기 단위라 그대로 사용한다.
-- (settings.mini_* 컬럼은 더 이상 쓰지 않지만 호환을 위해 그대로 둔다.)
-- 실행: Supabase SQL Editor 에 붙여넣고 Run. 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.mini_games (
  match_id   uuid primary key references public.matches(id) on delete cascade,
  home_score int,                         -- 실제 스코어 team_a (미입력 null)
  away_score int,                         -- 실제 스코어 team_b (미입력 null)
  created_at timestamptz not null default now(),
  constraint mini_game_scores_range check (
    (home_score is null and away_score is null)
    or (home_score between 0 and 50 and away_score between 0 and 50)
  )
);

alter table public.mini_games enable row level security;

-- 기존에 settings 로 운영하던 1개가 있으면 새 테이블로 이관(있을 때만)
insert into public.mini_games (match_id, home_score, away_score)
select mini_match_id, mini_home_score, mini_away_score
from public.settings
where id = 1 and mini_match_id is not null
on conflict (match_id) do nothing;
