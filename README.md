# 축잘알 토너먼트 🏆

2026 FIFA 북중미 월드컵 친목 예측 내기 웹앱. 친구 4명(윤·준·경·빈)이 각자 폰에서 라운드별 진출 팀을 예측하고, 관리자가 결과를 입력하면 점수·등수·선물 정산이 자동 계산된다.

- 스택: **Next.js (App Router) + Supabase**, **Vercel** 배포
- 기획 확정본: [`docs/chukjalal-tournament-plan.md`](docs/chukjalal-tournament-plan.md)

---

## 완성된 기능 (전체 4단계 구현 완료)

- ✅ **뼈대·테마** — Next.js(App Router) + Supabase, 축구장 다크 그린 테마(§6), 모바일 하단 탭
- ✅ **인증** — 참가자(이름+4자리 PIN) 로그인 / 관리자 PIN 진입. PIN 은 bcrypt 해시, 세션은 서명된 httpOnly 쿠키. 관리자 행위는 서버에서 검증(§4·§9)
- ✅ **관리자 셋업** — 32강 대진을 **경기별로 따로 저장**(두 팀 + 시작 시간) → 저장 즉시 그 경기 예측 오픈, 참가자 PIN 지정/재설정
- ✅ **예측·마감** — **경기별 승팀 선택(탭 즉시 저장)**, 시작 시간 전까지 수정 가능, **시작 시간이 지나면 자동 마감**(관리자 강제 마감도 가능), 마감 전 가림(누가 저장했는지만 공개)
- ✅ **대진표** — 전체 브라켓 + 경기 시작 시간, 내 예측 겹쳐보기(적중 초록/빗나감 빨강), 마감된 경기는 4명 예측 공개
- ✅ **결과·자동 진행** — 결과 입력 시 다음 라운드 대진 자동 생성, 준결승 패자로 3·4위전 생성, 최근 라운드 되돌리기
- ✅ **순위·채점·선물** — 총점 리더보드(1등 강조)·라운드별 점수 분해·동점 처리(우승팀→결승2팀)·선물 정산표 자동 계산

> 핵심 채점/동점/등수/선물 로직은 단위 테스트로 검증됨 (`scripts/test-tournament.ts`).

---

## 처음 한 번만 — 배포 준비 (사용자가 직접 따라 하기)

순서대로 따라 하면 된다. **계정 생성·키 입력·배포 버튼은 사용자가 직접** 해야 하는 부분이다.

### 1) Supabase 프로젝트 만들기

1. <https://supabase.com> 가입/로그인 → **New project**.
2. 이름(예: `chukjalal`), DB 비밀번호 지정(아무거나, 따로 안 써도 됨), 리전은 가까운 곳(예: Northeast Asia / Seoul).
3. 프로젝트가 생성될 때까지 1~2분 기다린다.

### 2) DB 스키마 실행

1. 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 파일 **전체 내용**을 복사해 붙여넣는다.
3. **Run** (또는 ⌘/Ctrl + Enter). "Success" 가 뜨면 끝. (재실행해도 안전하게 작성돼 있다.)
4. 왼쪽 **Table Editor** 에서 `participants`(윤·준·경·빈 4행), `settings`(1행), `matches`, `predictions` 테이블이 생겼는지 확인한다.

> **이미 배포된 DB 업데이트(경기 시작 시간 기능)**: 기존에 `schema.sql` 을 한 번
> 실행한 적이 있다면, `matches` 테이블에 `starts_at` 컬럼을 추가해야 한다. SQL Editor 에
> [`supabase/migrations/0001_match_starts_at.sql`](supabase/migrations/0001_match_starts_at.sql)
> 내용을 붙여넣고 **Run**. (새로 `schema.sql` 을 실행하는 경우엔 이미 포함돼 있어 불필요하다.)

### 3) Supabase API 키 확인

1. 왼쪽 **Project Settings** (톱니) → **API**.
2. 아래 3개 값을 메모한다:
   - **Project URL** (예: `https://abcd.supabase.co`)
   - **anon public** 키 (긴 문자열, 공개돼도 되는 키)
   - **service_role** 키 (긴 문자열, **절대 외부 노출 금지** — 서버에서만 사용)

### 4) 로컬에서 실행해 보기

> Node.js 18.18 이상(권장 20+)이 설치돼 있어야 한다. `node -v` 로 확인.

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 파일 만들기
cp .env.example .env.local
```

`.env.local` 을 열어 위 3) 에서 메모한 값으로 채운다:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # anon public 키
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # service_role 키 (NEXT_PUBLIC_ 붙이지 말 것)
```

```bash
# 3. 개발 서버 실행
npm run dev
```

브라우저에서 <http://localhost:3000> 접속 → 축구장 테마 + 하단 탭이 보이면 성공.
(현재 Stage 1 셸은 환경변수가 없어도 화면 자체는 뜬다. DB 연동은 다음 단계부터.)

### 5) GitHub 에 올리기

```bash
git init
git add .
git commit -m "feat: 축잘알 토너먼트 1단계 — 뼈대·스키마·배포"
# GitHub 에서 새 빈 저장소를 만든 뒤, 그 주소로:
git remote add origin https://github.com/<your-id>/<repo>.git
git branch -M main
git push -u origin main
```

> `.env.local` 은 `.gitignore` 에 들어 있어 **커밋되지 않는다**(키 노출 방지). 정상이다.

### 6) Vercel 배포

1. <https://vercel.com> 가입/로그인(GitHub 계정으로 로그인하면 편하다) → **Add New… → Project**.
2. 방금 push 한 GitHub 저장소를 **Import**.
3. Framework 는 Next.js 로 자동 인식된다. 빌드 설정은 기본값 그대로 둔다.
4. **Environment Variables** 에 아래 3개를 추가(`.env.local` 과 동일한 값):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. **Deploy** 클릭 → 1~2분 후 배포 완료.
6. 발급된 URL(`https://<프로젝트>.vercel.app`)로 접속해 화면이 뜨는지 확인. 이 주소를 친구들에게 공유하면 된다.

> 무료 티어로 충분하다 (Vercel Hobby + Supabase Free). 데이터 양이 매우 작다.

---

## 사용 방법

### 관리자 (빈)

1. 하단/상단의 **관리자** 진입 → PIN 입력. **처음 입력한 PIN 이 관리자 PIN 으로 등록**된다. (분실 시 Supabase `settings.admin_pin_hash` 를 비우면 재설정)
2. **32강 셋업**: "32강 대진" 섹션에서 **경기마다** 두 팀 + 시작 시간(선택)을 입력하고 **저장**한다. 저장하는 즉시 그 경기의 예측이 열린다(전체 16경기를 한 번에 저장하는 "대회 시작" 단계는 없다). 참가자 PIN 은 위쪽 "참가자 PIN" 에서 지정.
3. 이후 라운드마다:
   - **라운드 진행** 화면에서 각 경기의 **시작 시간을 설정/수정**할 수 있다.
   - 참가자들이 경기별로 예측(탭 즉시 저장) → **시작 시간이 지나면 그 경기 예측이 자동 마감**(시간 미설정 경기는 **강제 마감** 버튼으로 마감).
   - 마감된 경기에서 **진출(승리)한 팀을 눌러 결과 입력**.
   - 한 라운드 결과가 다 들어가면 **다음 라운드 대진이 자동 생성**된다. (준결승 끝나면 결승·3·4위전 자동 생성)
   - 잘못 입력했으면 **최근 라운드 되돌리기**로 복구(그 아래 라운드는 초기화).

### 참가자 (윤·준·경·빈)

1. 공유받은 URL 접속 → 이름 선택 + 4자리 PIN 으로 로그인.
2. **예측 탭**: 열린 라운드의 각 경기에서 이길 팀을 누르면 **즉시 저장**된다. **경기 시작 시간 전까지는** 다시 눌러 바꿀 수 있고, 시작 시간이 지나면 마감된다.
3. **대진표 탭**: 전체 브라켓 + 경기 시작 시간 + 내 예측 적중/빗나감. 마감된 경기는 4명 예측이 모두 공개된다.
4. **순위 탭**: 총점·등수·라운드별 점수, 그리고 선물 정산표(누가 누구에게 수수께끼 스킨 몇 개).

### 홈 화면에 추가 (앱처럼 쓰기)

휴대폰 브라우저로 접속해 홈 화면에 추가하면 주소창 없이 앱처럼 전체화면(standalone)으로 실행된다.

- **iPhone(Safari)**: 공유 버튼 → "홈 화면에 추가".
- **Android(Chrome)**: 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치".

아이콘·이름("축잘알")·상태바 색까지 다크 그린 테마로 설정돼 있다. (웹 매니페스트 + apple-touch-icon 적용)

---

## 로컬 개발 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 결과 실행 |
| `node_modules/.bin/tsc -p tsconfig.test.json && node .test-build/scripts/test-tournament.js` | 채점/등수/선물 로직 단위 테스트 |

---

## 프로젝트 구조

```
.
├─ docs/chukjalal-tournament-plan.md   # 기획 확정본(인수인계 문서)
├─ supabase/schema.sql                 # DB 스키마 + RLS + 시드 (SQL Editor 에 실행)
├─ scripts/test-tournament.ts          # 채점/동점/등수/선물 단위 테스트
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                     # 루트 레이아웃(폰트·테마·탭 셸)
│  │  ├─ globals.css                    # 디자인 토큰/잔디 배경
│  │  ├─ (main)/                        # 참가자 영역(로그인 게이트 + 상태 컨텍스트)
│  │  │  ├─ layout.tsx                  #   인증/셋업 게이트
│  │  │  ├─ page.tsx                    #   예측 탭
│  │  │  ├─ bracket/page.tsx            #   대진표 탭
│  │  │  └─ ranking/page.tsx            #   순위 탭
│  │  ├─ admin/page.tsx                 # 관리자 콘솔(로그인·셋업·결과·되돌리기)
│  │  └─ api/                           # 서버 라우트 (모든 쓰기/민감 읽기)
│  │     ├─ state/                      #   참가자용 상태(가림 규칙 적용)
│  │     ├─ auth/{login,logout}/        #   참가자 로그인
│  │     ├─ predict/                    #   픽/확정/확정취소
│  │     └─ admin/{login,logout,state,action}/  # 관리자 인증·셋업·결과·마감·되돌리기
│  ├─ components/                       # 헤더·하단탭·축구장 배경·카드·로그인·상태 Provider
│  └─ lib/
│     ├─ rounds.ts                      # 라운드 키·배점(총 74점) 정의
│     ├─ tournament.ts                  # 브라켓 진행/채점/등수/선물 (순수 함수)
│     ├─ state.ts                       # 서버: DB → 화면 상태 (가림 규칙)
│     ├─ auth.ts / pin.ts               # 세션 서명 / PIN 해시
│     ├─ types.ts                       # DB 행 타입
│     └─ supabase/{client,server}.ts    # anon(클라) / service_role(서버) 클라이언트
└─ .env.example                         # 환경변수 양식
```

---

## 보안 메모 (§4, §9)

- **PIN 은 해시 저장** (평문 금지). 서버에서 bcrypt 로 처리한다.
- **관리자 행위(결과 입력·되돌리기·강제 마감·PIN 재설정)는 서버에서 관리자 PIN 검증 뒤에만** 수행한다. 클라이언트 우회가 불가능하도록 `service_role` 키는 서버 라우트에서만 쓴다.
- Supabase RLS 를 모든 테이블에 켜고, 클라이언트(anon)에는 **안전한 읽기**만(공개 정보인 대진/진행상태, 참가자 이름) 뷰로 노출한다. 민감 데이터/쓰기는 전부 서버 경유.
- `SUPABASE_SERVICE_ROLE_KEY` 는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다(붙이면 브라우저로 노출됨).
