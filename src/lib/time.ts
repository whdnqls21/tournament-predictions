// 경기 시작 시간 표시/입력 변환 헬퍼 (클라이언트 공용).
// DB 는 ISO(UTC) 로 저장, 화면 입력/표시는 사용자 로컬 시간 기준.

// datetime-local 입력값(로컬 "YYYY-MM-DDTHH:mm")으로 변환. 없으면 "".
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// datetime-local 입력값 → ISO(UTC) 문자열. 빈값이면 null.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // 로컬 시간으로 해석
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// 사람이 읽는 한글 표기. 예: "6/27(금) 19:00"
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function formatKickoff(iso: string | null | undefined): string {
  if (!iso) return "시간 미정";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "시간 미정";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]}) ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// 시작까지 남은 시간 짧은 표기. 지났으면 null.
export function formatCountdown(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - now;
  if (diff <= 0) return null;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 후`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 후`;
  const day = Math.floor(hr / 24);
  return `${day}일 후`;
}
