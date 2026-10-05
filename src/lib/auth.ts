import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSalonBySlug } from "./booking";
import { appDb } from "./server";

const COOKIE = "frisor_admin";

/** Kodeordet til /admin. I udvikling er det "demo", i produktion skal ADMIN_PASSWORD sættes. */
export function adminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return process.env.NODE_ENV === "production" ? null : "demo";
}

function sessionValue(password: string) {
  return createHmac("sha256", password).update("frisor-admin-v1").digest("base64url");
}

export function passwordMatches(input: string): boolean {
  const pw = adminPassword();
  if (!pw) return false;
  const a = Buffer.from(sessionValue(input));
  const b = Buffer.from(sessionValue(pw));
  return timingSafeEqual(a, b);
}

export async function startSession() {
  const pw = adminPassword();
  if (!pw) return;
  (await cookies()).set(COOKIE, sessionValue(pw), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const pw = adminPassword();
  const value = (await cookies()).get(COOKIE)?.value;
  return !!pw && !!value && value === sessionValue(pw);
}

/** Bruges i alle admin-sider og actions. Returnerer den salon, admin styrer. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = await appDb();
  const salon = await getSalonBySlug(db, process.env.SALON_SLUG || "demo");
  if (!salon) throw new Error("Salonen findes ikke. Kør npm run db:seed eller sæt SALON_SLUG.");
  return { db, salon };
}
