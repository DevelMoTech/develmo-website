import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/api";
import { confirmEmailChange } from "@/lib/auth/flows";
import { getClientIp, hashIp } from "@/lib/auth/ip";
import { tokenQuerySchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Landing route for the emailed confirmation link. The signed single-use
// token is the authorisation; on success every session is revoked and the
// user signs in with the new address.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = tokenQuerySchema.safeParse(url.searchParams.get("token") ?? "");
  const ctx = { ipHash: hashIp(getClientIp(req.headers)), userAgent: req.headers.get("user-agent") };
  const ok = parsed.success ? (await confirmEmailChange(parsed.data, ctx)).ok : false;
  const res = NextResponse.redirect(
    new URL(ok ? "/admin/login?notice=email_changed" : "/admin/account?email=failed", url.origin),
    303,
  );
  if (ok) clearSessionCookie(res);
  return res;
}
