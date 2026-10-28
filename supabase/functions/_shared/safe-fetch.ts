// SSRF-safe outbound fetch for URLs that come from users, the database, web pages or AI output
// (dependency-free; DNS and fetch are injected so the rules are unit-tested with plain Node).
//
// Rules, applied to the first URL AND to every redirect hop:
//   * https only (http only if the caller explicitly allows it); no credentials in the URL; default ports only
//     unless explicitly allowed.
//   * Optional host allowlist (exact host or subdomain of an allowed domain).
//   * The host is resolved; EVERY address must be public. Loopback, private (RFC 1918), CGNAT, link-local
//     (incl. cloud metadata 169.254.169.254), multicast, reserved, IPv6 ULA/link-local/loopback and
//     IPv4-mapped/NAT64/6to4 forms of blocked IPv4 are refused. Literal IP hosts are checked the same way.
//   * Redirects are followed manually (max N), each target re-validated.
//   * Timeout for the whole request (AbortSignal) and a hard response-size cap while streaming.
// DNS rebinding: addresses are resolved and checked immediately before each connection, and every hop is
// re-resolved. A resolver that changes its answer between our check and the platform's own lookup is still a
// residual risk without IP pinning (Deno fetch cannot pin an address for TLS); use `allowHosts` for any
// destination that can be known in advance.

export interface SafeFetchOptions {
  resolve: (host: string) => Promise<string[]>; // all A/AAAA records
  fetchImpl?: typeof fetch;
  allowHosts?: string[]; // exact hosts or parent domains, lower-case
  allowHttp?: boolean;
  allowPorts?: number[];
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
}

export class SafeFetchError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "SafeFetchError"; }
}

const fail = (code: string, msg: string): never => { throw new SafeFetchError(code, msg); };

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4], ["255.255.255.255", 32],
];
function v4Blocked(n: number): boolean {
  return V4_BLOCKED.some(([base, bits]) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

/** Expand an IPv6 address to 8 hextets (handles "::" and an embedded dotted IPv4 tail). */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const n = ipv4ToInt(tail[1]);
    if (n === null) return null;
    s = s.slice(0, -tail[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const parts = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...rest];
  if (parts.length !== 8 || parts.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return parts.map((h) => parseInt(h, 16));
}

/** True if the address must never be contacted. Anything unparseable counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return v4Blocked(v4);
  const h = expandV6(ip);
  if (!h) return true;
  const embedded = (hi: number, lo: number) => v4Blocked(((hi << 16) >>> 0) + lo);
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return embedded(h[6], h[7]); // ::ffff:a.b.c.d
  if (h.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible
  if (h[0] === 0x64 && h[1] === 0xff9b) return embedded(h[6], h[7]); // NAT64 64:ff9b::/96
  if (h[0] === 0x2002) return embedded(h[1], h[2]); // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (h[0] === 0x2001 && h[1] < 0x0200) return true; // 2001::/23 IETF protocol assignments (Teredo etc.)
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // discard-only
  return false;
}

function hostAllowed(host: string, allow?: string[]): boolean {
  if (!allow || allow.length === 0) return true;
  return allow.some((a) => host === a || host.endsWith("." + a));
}

/** Parse and check a URL before any network activity. Returns the normalised URL. */
export function checkUrl(raw: string, o: Pick<SafeFetchOptions, "allowHosts" | "allowHttp" | "allowPorts"> = {}): URL {
  if (typeof raw !== "string" || raw.length > 2048) fail("bad_url", "URL missing or too long");
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return fail("bad_url", "Not a valid URL"); }
  const protocols = o.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!protocols.includes(u.protocol)) fail("bad_protocol", `Protocol ${u.protocol} not allowed`);
  if (u.username || u.password) fail("credentials", "Credentials in URL not allowed");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) fail("bad_url", "Missing host");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    fail("blocked_host", "Local host names are not allowed");
  }
  if (u.port && !(o.allowPorts ?? []).includes(Number(u.port))) fail("blocked_port", `Port ${u.port} not allowed`);
  const literal = host.startsWith("[") || /^[\d.]+$/.test(host) || host.includes(":");
  if (literal && isBlockedAddress(host)) fail("blocked_address", "Address is not public");
  if (/^\d+$/.test(host) || /^0x/i.test(host)) fail("bad_url", "Numeric host forms are not allowed");
  if (!hostAllowed(host, o.allowHosts)) fail("host_not_allowed", `Host ${host} is not on the allowlist`);
  return u;
}

async function checkResolution(u: URL, resolve: SafeFetchOptions["resolve"]): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipv4ToInt(host) !== null || host.includes(":")) return; // literal, already checked
  let addrs: string[];
  try { addrs = await resolve(host); } catch { return fail("dns_failed", `Could not resolve ${host}`); }
  if (!addrs || addrs.length === 0) fail("dns_failed", `No addresses for ${host}`);
  if (addrs.some(isBlockedAddress)) fail("blocked_address", `${host} resolves to a non-public address`);
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) fail("too_large", "Response too large");
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } fail("too_large", "Response too large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

export interface SafeResponse { url: string; status: number; contentType: string; body: Uint8Array; text(): string }

/** Fetch with all of the rules above. Throws SafeFetchError on any violation. */
export async function safeFetch(raw: string, o: SafeFetchOptions): Promise<SafeResponse> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const maxRedirects = o.maxRedirects ?? 3;
  const maxBytes = o.maxBytes ?? 5 * 1024 * 1024;
  const signal = AbortSignal.timeout(o.timeoutMs ?? 10_000);
  let u = checkUrl(raw, o);
  for (let hop = 0; ; hop++) {
    await checkResolution(u, o.resolve);
    let res: Response;
    try {
      res = await fetchImpl(u.toString(), { method: o.method ?? "GET", redirect: "manual", signal, headers: o.headers });
    } catch (e) {
      if ((e as Error)?.name === "TimeoutError" || signal.aborted) fail("timeout", "Request timed out");
      return fail("network", "Request failed");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= maxRedirects) fail("too_many_redirects", "Too many redirects");
      try { await res.body?.cancel(); } catch { /* ignore */ }
      u = checkUrl(new URL(res.headers.get("location")!, u).toString(), o);
      continue;
    }
    const body = await readCapped(res, maxBytes);
    return {
      url: u.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body,
      text: () => new TextDecoder().decode(body),
    };
  }
}

/** Deno resolver for production use: all A and AAAA records. */
export function denoResolver(): SafeFetchOptions["resolve"] {
  const D = (globalThis as unknown as { Deno: { resolveDns(host: string, type: string): Promise<string[]> } }).Deno;
  return async (host: string) => {
    const out: string[] = [];
    for (const type of ["A", "AAAA"]) {
      try { out.push(...(await D.resolveDns(host, type))); } catch { /* no record of this type */ }
    }
    return out;
  };
}
