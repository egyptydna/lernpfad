import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    return timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}
export async function user() {
  const token = (await cookies()).get("learn_session")?.value;
  if (!token) return null;
  const r = await (
    await db()
  ).query(
    "SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=$1 AND expires_at>now()",
    [hashToken(token)],
  );
  return r.rows[0] || null;
}
export async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  await (
    await db()
  ).query("INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,$3)", [
    hashToken(token),
    userId,
    new Date(Date.now() + 30 * 86400000),
  ]);
  (await cookies()).set("learn_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 30 * 86400,
  });
}
export async function logout() {
  const c = await cookies();
  const token = c.get("learn_session")?.value;
  if (token)
    await (
      await db()
    ).query("DELETE FROM sessions WHERE token=$1", [hashToken(token)]);
  c.delete("learn_session");
}

export function recoveryCode() {
  return randomBytes(16)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,8}/g)!
    .join("-");
}
export function recoveryHash(code: string) {
  return hashToken(code.replace(/[-\s]/g, "").toUpperCase());
}
