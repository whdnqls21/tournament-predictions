-- ════════════════════════════════════════════════════════════════════════
-- 축잘알 토너먼트 — Supabase 스키마 (§8 데이터 모델)
-- ────────────────────────────────────────────────────────────────────────
-- 실행 방법: Supabase 대시보드 → SQL Editor → 새 쿼리에 이 파일 전체 붙여넣기 → Run.
-- 한 번에 전체를 실행하면 된다. 재실행해도 안전하도록 작성했다(drop if exists).
--
-- 보안 모델 (§4, §9):
--   - 모든 테이블에 RLS(행 수준 보안)를 켠다.
--   - anon(공개) 키로는 "안전한 읽기"만 허용한다:
--       · matches            → 공개 읽기 (팀/결과는 어차피 공개 정보)
--       · participants_public → 이름·순서만 노출하는 뷰 (pin_hash 절대 노출 안 됨)
--       · settings_public     → 진행 상태만 노출하는 뷰 (admin_pin_hash 노출 안 됨)
--   - 쓰기(예측 저장/확정, 결과 입력, 마감, PIN 설정)와 "남의 예측 가림" 같은
--     민감 로직은 전부 Next.js 서버 라우트에서 service_role 키로 수행한다.
--     service_role 은 RLS 를 우회하므로, 클라이언트는 직접 쓰기를 할 수 없다.
--   - PIN 은 평문 저장 금지. 서버에서 bcrypt 해시로 저장한다(*_pin_hash).
-- ════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() 사용 (Postgres 13+ 코어에 포함, Supabase 기본 제공)

-- ── 공용: updated_at 자동 갱신 트리거 함수 ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1) participants — 참가자 4명 (윤·준·경·빈)
-- ════════════════════════════════════════════════════════════════════════
drop table if exists public.predictions cascade;
drop table if exists public.matches cascade;
drop table if exists public.settings cascade;
drop table if exists public.participants cascade;

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,            -- 윤 / 준 / 경 / 빈
  display_order int  not null,                   -- 화면 정렬 순서
  pin_hash      text,                            -- 개인 4자리 PIN 해시 (셋업 전 null)
  created_at    timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- 2) settings — 단일 행(id=1) 전역 설정
-- ════════════════════════════════════════════════════════════════════════
create table public.settings (
  id                 int primary key default 1,
  admin_pin_hash     text,                        -- 관리자 PIN 해시 (셋업 전 null)
  current_open_round text,                         -- 현재 예측 오픈 라운드 (R32/R16/R8/SF/FINAL/THIRD), 없으면 null
  setup_done         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint settings_singleton check (id = 1),
  constraint settings_round_valid check (
    current_open_round is null
    or current_open_round in ('R32','R16','R8','SF','FINAL','THIRD')
  )
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- 3) matches — 경기 (브라켓 자리별)
-- ════════════════════════════════════════════════════════════════════════
create table public.matches (
  id           uuid primary key default gen_random_uuid(),
  round        text not null,                     -- R32/R16/R8/SF/FINAL/THIRD
  bracket_slot int  not null,                     -- 라운드 내 위치 (R32:0~15, R16:0~7, R8:0~3, SF:0~1, FINAL/THIRD:0)
  team_a       text,                              -- 다음 라운드는 진출 결과로 채워지므로 null 허용
  team_b       text,
  winner       text,                              -- null = 결과 미입력
  starts_at    timestamptz,                       -- 경기 시작 시간 (null = 미정). 이 시각이 지나면 예측 자동 마감.
  is_locked    boolean not null default false,    -- 예측 수동 마감 여부 (관리자 강제 마감)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint matches_round_valid check (round in ('R32','R16','R8','SF','FINAL','THIRD')),
  constraint matches_unique_slot unique (round, bracket_slot),
  -- 결과는 두 팀 중 하나여야 한다 (같은 행 내 컬럼 참조 CHECK 가능)
  constraint matches_winner_valid check (
    winner is null or winner = team_a or winner = team_b
  )
);

create index matches_round_idx on public.matches (round);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- 4) predictions — 예측 (참가자 × 경기, 행 분리로 동시 수정 충돌 방지)
-- ════════════════════════════════════════════════════════════════════════
create table public.predictions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  match_id       uuid not null references public.matches(id) on delete cascade,
  picked_team    text not null,                   -- 찍은 팀 (서버에서 team_a/team_b 중 하나인지 검증)
  confirmed      boolean not null default false,  -- 확정 여부 (마감 전엔 취소·수정 가능)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint predictions_unique unique (participant_id, match_id)
);

create index predictions_match_idx on public.predictions (match_id);
create index predictions_participant_idx on public.predictions (participant_id);

create trigger predictions_set_updated_at
  before update on public.predictions
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- RLS — 모든 테이블 잠그고, 안전한 읽기만 뷰로 노출
-- ════════════════════════════════════════════════════════════════════════
alter table public.participants enable row level security;
alter table public.settings     enable row level security;
alter table public.matches      enable row level security;
alter table public.predictions  enable row level security;

-- matches: 공개 읽기 허용 (팀/결과는 공개 정보). 쓰기는 정책 없음 → 서버(service_role)만 가능.
drop policy if exists matches_public_read on public.matches;
create policy matches_public_read
  on public.matches for select
  to anon, authenticated
  using (true);

-- participants / settings / predictions: anon·authenticated 정책 없음 → 직접 접근 불가.
-- (service_role 은 RLS 를 우회하므로 서버 라우트에서만 접근 가능)

-- ── 안전 노출 뷰 ─────────────────────────────────────────────────────────
-- 뷰는 소유자(postgres) 권한으로 기반 테이블을 읽으므로, 아래 컬럼만 anon 에 노출된다.
-- pin_hash / admin_pin_hash 는 절대 포함하지 않는다.

create or replace view public.participants_public as
  select id, name, display_order
  from public.participants
  order by display_order;

create or replace view public.settings_public as
  select current_open_round, setup_done
  from public.settings
  where id = 1;

grant select on public.participants_public to anon, authenticated;
grant select on public.settings_public     to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 시드 데이터 — 참가자 4명 + settings 단일 행
-- (PIN/관리자 PIN 은 셋업 단계에서 서버가 해시로 채운다)
-- ════════════════════════════════════════════════════════════════════════
insert into public.participants (name, display_order) values
  ('윤', 1),
  ('준', 2),
  ('경', 3),
  ('빈', 4)
on conflict (name) do nothing;

insert into public.settings (id, setup_done) values (1, false)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 채점/순위/선물 정산은 예측·결과로부터 "계산"해서 보여준다(§8). 별도 점수 테이블 없음.
-- 라운드별 경기당 점수: R32=1, R16=2, R8=4, SF=6, FINAL=10, THIRD=4 (총 74점)
-- → 계산 로직은 앱(src/lib/rounds.ts) 및 이후 단계의 서버 라우트에서 구현.
-- ════════════════════════════════════════════════════════════════════════
