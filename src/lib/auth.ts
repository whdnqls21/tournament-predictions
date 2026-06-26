import "server-only";

import crypto from "node:crypto";

import { cookies } from "next/headers";

// 친목용 경량 세션. PIN 검증 성공 후 서명된 httpOnly 쿠키를 심는다.
// 서명 키는 서버 전용 비밀(service_role 키)에서 파생 → 별도 env 추가 없이 위조 방지.
// (강한 인증 아님. §4 — 4명 친목용. 단, 관리자 행위는 서버에서 PIN 검증 뒤에만 수행.)

export const PARTICIPANT_COOKIE = "cj_session";
export const ADMIN_COOKIE = "cj_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

export interface ParticipantSession {
  role: "participant";
  id: string;
  name: string;
}

export interface AdminSession {
  role: "admin";
}

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 없어 세션 서명을 할 수 없습니다.");
  }
  return s;
}

export function signSession(payload: ParticipantSession | AdminSession): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${mac}`;
}

function verifyToken(token: string | undefined): unknown {
  if (!token) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(macBuf, expBuf)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    return null;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  secure: process.env.NODE_ENV === "production",
};

export async function getParticipantSession(): Promise<ParticipantSession | null> {
  const jar = await cookies();
  const payload = verifyToken(jar.get(PARTICIPANT_COOKIE)?.value);
  if (
    payload &&
    typeof payload === "object" &&
    (payload as ParticipantSession).role === "participant"
  ) {
    return payload as ParticipantSession;
  }
  return null;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const payload = verifyToken(jar.get(ADMIN_COOKIE)?.value);
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as AdminSession).role === "admin"
  );
}
