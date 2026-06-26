import "server-only";

import bcrypt from "bcryptjs";

// PIN 은 평문 저장 금지 (§9). bcrypt 해시로 저장/검증한다.
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

// 4자리 숫자 PIN
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}
