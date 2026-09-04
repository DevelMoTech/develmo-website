// IPv4 and IPv6 address and CIDR handling for the access control list
// (brief §3.7). Pure module with no dependencies: it is bundled into
// src/proxy.ts, used by the console's validation, and unit tested.
//
// Addresses are compared as fixed-width byte arrays, so an IPv4-mapped IPv6
// address (::ffff:203.0.113.9) matches an IPv4 rule and vice versa.

export type ParsedIp = { bytes: number[]; family: 4 | 6 };
export type ParsedCidr = { bytes: number[]; family: 4 | 6; prefix: number; text: string };

function parseIpv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    // No octal or padded forms: 010 is not 8 here, and not 10 either.
    if (p.length > 1 && p.startsWith("0")) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseIpv6(input: string): number[] | null {
  let text = input;
  // A trailing IPv4 part, as in ::ffff:203.0.113.9 or 2001:db8::1.2.3.4.
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const afterColon = lastColon >= 0 ? text.slice(lastColon + 1) : "";
  if (afterColon.includes(".")) {
    const v4 = parseIpv4(afterColon);
    if (!v4) return null;
    tail = v4;
    text = text.slice(0, lastColon + 1);
    // The IPv4 tail fills the last two groups.
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
  }

  const doubleColon = text.indexOf("::");
  if (doubleColon !== text.lastIndexOf("::")) return null;

  const groupsFromTail = tail.length ? 2 : 0;
  const toGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  let head: number[];
  let rest: number[];
  if (doubleColon >= 0) {
    const left = toGroups(text.slice(0, doubleColon));
    const right = toGroups(text.slice(doubleColon + 2).replace(/:$/, ""));
    if (!left || !right) return null;
    const missing = 8 - groupsFromTail - left.length - right.length;
    if (missing < 0) return null;
    head = left;
    rest = [...new Array<number>(missing).fill(0), ...right];
  } else {
    const all = toGroups(text.replace(/:$/, ""));
    if (!all) return null;
    if (all.length + groupsFromTail !== 8) return null;
    head = all;
    rest = [];
  }

  const groups = [...head, ...rest];
  const bytes: number[] = [];
  for (const g of groups) {
    bytes.push((g >> 8) & 0xff, g & 0xff);
  }
  bytes.push(...tail);
  return bytes.length === 16 ? bytes : null;
}

// Every address is held as 16 bytes; IPv4 becomes its IPv4-mapped form so the
// two families compare directly.
const V4_PREFIX = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff];

export function parseIp(input: string): ParsedIp | null {
  let text = (input ?? "").trim();
  if (!text) return null;
  // A bracketed address, with or without a port: [::1]:443.
  const bracket = text.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) text = bracket[1];
  // Strip a zone index (fe80::1%eth0).
  const zone = text.indexOf("%");
  if (zone > 0) text = text.slice(0, zone);
  // An IPv4 address with a port.
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(text)) text = text.slice(0, text.lastIndexOf(":"));

  const v4 = parseIpv4(text);
  if (v4) return { bytes: [...V4_PREFIX, ...v4], family: 4 };
  const v6 = parseIpv6(text);
  if (v6) {
    const mapped = V4_PREFIX.every((b, i) => v6[i] === b);
    return { bytes: v6, family: mapped ? 4 : 6 };
  }
  return null;
}

export function parseCidr(input: string): ParsedCidr | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  const slash = text.lastIndexOf("/");
  const addressPart = slash >= 0 ? text.slice(0, slash) : text;
  const prefixPart = slash >= 0 ? text.slice(slash + 1) : null;

  const ip = parseIp(addressPart);
  if (!ip) return null;

  const maxPrefix = ip.family === 4 ? 32 : 128;
  let prefix = maxPrefix;
  if (prefixPart !== null) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > maxPrefix) return null;
  }
  // Stored against the 128-bit form, so an IPv4 /24 is a /120 internally.
  const bitPrefix = ip.family === 4 ? prefix + 96 : prefix;
  return { bytes: ip.bytes, family: ip.family, prefix: bitPrefix, text: normaliseCidr(ip, prefix) };
}

function formatIp(ip: ParsedIp): string {
  if (ip.family === 4) return ip.bytes.slice(12).join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((ip.bytes[i] << 8) | ip.bytes[i + 1]).toString(16));
  // Longest run of zero groups becomes "::".
  let bestStart = -1;
  let bestLen = 0;
  let start = -1;
  let len = 0;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === "0") {
      if (start < 0) start = i;
      len += 1;
    } else {
      if (len > bestLen && len > 1) {
        bestStart = start;
        bestLen = len;
      }
      start = -1;
      len = 0;
    }
  }
  if (bestStart < 0) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

// The rule as it is stored and shown: canonical address, and the prefix only
// when it is not a single host.
function normaliseCidr(ip: ParsedIp, prefix: number): string {
  const maxPrefix = ip.family === 4 ? 32 : 128;
  const address = formatIp(ip);
  return prefix === maxPrefix ? address : `${address}/${prefix}`;
}

// True when the address falls inside the range, comparing whole bytes then
// the remaining bits of the boundary byte.
export function ipInCidr(ip: ParsedIp, cidr: ParsedCidr): boolean {
  const fullBytes = cidr.prefix >> 3;
  for (let i = 0; i < fullBytes; i++) if (ip.bytes[i] !== cidr.bytes[i]) return false;
  const remainingBits = cidr.prefix & 7;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (ip.bytes[fullBytes] & mask) === (cidr.bytes[fullBytes] & mask);
}

// How many addresses a rule covers, for the console's warning about broad
// rules. Capped: anything wider than a /104 is reported as the cap.
export function cidrSize(cidr: ParsedCidr): number {
  const bits = 128 - cidr.prefix;
  return bits > 24 ? Number.MAX_SAFE_INTEGER : 2 ** bits;
}
