// Who is allowed to see the unfloored numbers.
//
// Cloudflare Access, rather than a bearer token this Worker would have to hold.
// Access signs a short-lived RS256 assertion with a key only Cloudflare has, so
// what is configured here is a team domain, an audience tag and an email list:
// public facts, none of them a credential. The collector still ships no secret,
// which is the property worth keeping.
//
// The verification below is not decoration. An Access policy protects a
// hostname, and this Worker also answers on its `workers.dev` address, which no
// policy covers. Checking the assertion here is what closes that door.

import { z } from 'zod';

const JWKS_TTL_MS = 60 * 60 * 1000;

// Access assertions are minted for minutes, not hours. A generous skew for
// clock drift, and nothing more.
const CLOCK_SKEW_SECS = 60;

const Jwk = z.object({
  kid: z.string().min(1),
  kty: z.literal('RSA'),
  n: z.string().min(1),
  e: z.string().min(1),
  alg: z.string().optional(),
});

const Jwks = z.object({ keys: z.array(Jwk).min(1) });

const Header = z.object({ alg: z.literal('RS256'), kid: z.string().min(1) });

const Claims = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  iss: z.string().min(1),
  exp: z.int(),
  iat: z.int().optional(),
  nbf: z.int().optional(),
  email: z.string().optional(),
});

export interface AccessConfig {
  /** `<team>.cloudflareaccess.com`, without a scheme. */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
  /** Lowercased emails allowed through. Empty means nobody, never everybody. */
  emails: string[];
}

export type Verdict =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; reason: string };

/** Reads the three Access settings, or `null` when the route must stay shut. */
export function configFrom(env: {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
}): AccessConfig | null {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim() ?? '';
  const aud = env.ACCESS_AUD?.trim() ?? '';
  const emails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!teamDomain || !aud || emails.length === 0) return null;
  return { teamDomain, aud, emails };
}

// `atob` throws on any character outside the alphabet and on a length of 1 mod
// 4, and everything decoded here arrives from an unauthenticated caller. Null,
// never an exception: a malformed assertion is a 401, not a 500 with the error
// log filled in by whoever sent it.
function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = s.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
    return bytes;
  } catch {
    return null;
  }
}

function jsonPart(part: string): unknown {
  const bytes = fromB64url(part);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

let cache: { at: number; domain: string; keys: z.infer<typeof Jwks>['keys'] } | null = null;

async function keysFor(
  teamDomain: string,
  now: number,
  fetcher: typeof fetch,
): Promise<z.infer<typeof Jwks>['keys'] | null> {
  if (cache && cache.domain === teamDomain && now - cache.at < JWKS_TTL_MS) return cache.keys;
  const res = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) return null;
  // A 200 carrying something that is not JSON is the identity provider being
  // unreachable in a different costume, not a reason to throw.
  const document = await res.json().catch(() => null);
  const parsed = Jwks.safeParse(document);
  if (!parsed.success) return null;
  cache = { at: now, domain: teamDomain, keys: parsed.data.keys };
  return parsed.data.keys;
}

/** Forget the cached signing keys. Called between tests; never in production,
 * where the TTL is the only thing that should expire them. */
export function resetKeyCache(): void {
  cache = null;
}

/**
 * Verify one Access assertion against the team's published keys and the
 * configured audience, and check the identity it names is allowed here.
 *
 * Every failure is a plain verdict rather than a throw, so a route can answer
 * without learning which of the checks it was.
 */
export async function verify(
  token: string | undefined,
  config: AccessConfig,
  nowMs: number,
  fetcher: typeof fetch = fetch,
): Promise<Verdict> {
  if (!token) return { ok: false, status: 401, reason: 'no access assertion' };
  const [rawHeader, rawClaims, rawSignature] = token.split('.');
  if (!rawHeader || !rawClaims || !rawSignature) {
    return { ok: false, status: 401, reason: 'malformed assertion' };
  }

  const header = Header.safeParse(jsonPart(rawHeader));
  if (!header.success) return { ok: false, status: 401, reason: 'unexpected assertion header' };

  const keys = await keysFor(config.teamDomain, nowMs, fetcher);
  if (!keys) return { ok: false, status: 503, reason: 'cannot reach the identity provider' };
  const jwk = keys.find((k) => k.kid === header.data.kid);
  if (!jwk) return { ok: false, status: 401, reason: 'unknown signing key' };

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signature = fromB64url(rawSignature);
  if (!signature) return { ok: false, status: 401, reason: 'malformed assertion' };
  const signed = new TextEncoder().encode(`${rawHeader}.${rawClaims}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!valid) return { ok: false, status: 401, reason: 'bad signature' };

  const claims = Claims.safeParse(jsonPart(rawClaims));
  if (!claims.success) return { ok: false, status: 401, reason: 'unexpected assertion claims' };
  const { aud, iss, exp, nbf, email } = claims.data;

  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.aud)) {
    return { ok: false, status: 401, reason: 'assertion is for another application' };
  }
  if (iss !== `https://${config.teamDomain}`) {
    return { ok: false, status: 401, reason: 'assertion is from another team' };
  }

  const nowSecs = Math.floor(nowMs / 1000);
  if (exp + CLOCK_SKEW_SECS < nowSecs) return { ok: false, status: 401, reason: 'expired' };
  if (nbf !== undefined && nbf - CLOCK_SKEW_SECS > nowSecs) {
    return { ok: false, status: 401, reason: 'not yet valid' };
  }

  const who = email?.trim().toLowerCase() ?? '';
  if (!who || !config.emails.includes(who)) {
    return { ok: false, status: 403, reason: 'not an administrator of this collector' };
  }
  return { ok: true, email: who };
}
