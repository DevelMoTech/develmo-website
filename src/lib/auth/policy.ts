import { revalidateTag, unstable_cache } from "next/cache";
import { getSetting } from "@/lib/admin/settings";
import type { MfaPolicy } from "@/lib/schemas/security";
import { mfaRequired, type Role } from "./rbac";

// The second-factor policy: whether the console asks for an authenticator
// code after the password, and for whom. Set by the Owner under Security,
// Authentication; stored as the auth_policy setting. The default is
// "optional": anyone may set up an authenticator and is then asked for it,
// nobody is made to. The role rule from the brief (Owner and Admin must)
// is the "admins" level.
//
// Every admin page render and API call asks, so the value lives in the
// shared data cache under a tag, and a save expires the tag: the change is
// read by the next request everywhere, pages and route handlers alike. A
// per-module cache would not do: pages and route handlers are separate
// bundles with separate module instances, and a save through one left the
// other reading the old value until its own timer ran out.

const TAG = "auth-policy";

const readPolicy = unstable_cache(async (): Promise<MfaPolicy> => (await getSetting("auth_policy")).mfa, ["auth-policy"], { tags: [TAG], revalidate: 300 });

export async function getMfaPolicy(): Promise<MfaPolicy> {
  return readPolicy();
}

// Called by the save path, inside a route handler.
export function bustMfaPolicy(): void {
  revalidateTag(TAG, { expire: 0 });
}

// Pure rules, unit tested.

// Whether an account with this role must have an authenticator before it can
// use the console.
export function mfaRequiredUnder(policy: MfaPolicy, role: Role): boolean {
  if (policy === "everyone") return true;
  if (policy === "admins") return mfaRequired(role);
  return false;
}

// Whether a sign in has to clear the second factor: the person has one set
// up, and the console is asking. "off" keeps enrolments but stops asking.
export function secondFactorAsked(policy: MfaPolicy, totpEnabled: boolean): boolean {
  return policy !== "off" && totpEnabled;
}

// Whether the person is sent to set up an authenticator before anything else.
export function mustEnrol(policy: MfaPolicy, user: { role: Role; totpEnabled: boolean }): boolean {
  return mfaRequiredUnder(policy, user.role) && !user.totpEnabled;
}

// A session that was waiting for the second factor when the policy was
// turned off is let through; the row keeps its flag, so it is asked again
// if the policy comes back.
export function stillPending(policy: MfaPolicy, sessionMfaPending: boolean): boolean {
  return sessionMfaPending && policy !== "off";
}
