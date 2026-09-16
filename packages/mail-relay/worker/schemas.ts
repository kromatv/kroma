import { z } from 'zod';

const ADDRESS = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** A mailbox, lowercased so two spellings of one inbox share one budget. */
export const Address = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(ADDRESS, 'not an address');

const PRIVATE_SUFFIXES = ['.local', '.lan', '.home.arpa'];

function privateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** A host nobody on the public internet can be sent to: no proof of control
 * is asked of it, and no consent link pointing at it is worth anything to a
 * stranger. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]') return true;
  if (host.startsWith('[fc') || host.startsWith('[fd')) return true;
  if (privateIpv4(host)) return true;
  return PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Whether `s` is exactly an origin (scheme, host, port; no path, query or
 * credentials) a recipient can be asked to trust: https anywhere, http only on
 * a host that is not on the public internet.
 */
export function isOrigin(s: string): boolean {
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (url.origin !== s) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && isPrivateHost(url.hostname);
}

function withoutTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** The server an instance is bound to. A trailing slash is forgiven, nothing else. */
export const Origin = z
  .string()
  .trim()
  .max(256)
  .transform(withoutTrailingSlashes)
  .refine(isOrigin, 'not an origin');

const printable = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const B64URL = /^[A-Za-z0-9_-]+$/;

/** An uncompressed P-256 public point, base64url: 65 bytes, 87 characters. */
export const PublicKey = z.string().regex(B64URL).length(87);

/** A raw `r || s` P-256 signature, base64url: 64 bytes, 86 characters. */
export const Signature = z.string().regex(B64URL).length(86);

/** `POST /v1/register`: a server presents its origin and its key. */
export const RegisterRequest = z.object({
  origin: Origin,
  publicKey: PublicKey,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

/** What a registered server answers at `/api/mail/relay-challenge`. */
export const ChallengeAnswer = z.object({
  nonce: z.string().min(1).max(128),
  signature: Signature,
});

/**
 * The envelope every authenticated call arrives in. `payload` is the exact
 * text the instance signed; it is only parsed once the signature holds.
 */
export const SignedRequest = z.object({
  instance: z.string().min(1).max(4096),
  payload: z
    .string()
    .min(2)
    .max(256 * 1024),
  signature: Signature,
});
export type SignedRequest = z.infer<typeof SignedRequest>;

/** How long a signed payload is accepted around its own timestamp. */
export const PAYLOAD_WINDOW_SECS = 5 * 60;

const Stamped = z.object({ ts: z.number().int() });

/** `POST /v1/consent`: an instance asks for the link one mailbox may click. */
export const ConsentPayload = Stamped.extend({
  to: Address,
  token: z.string().trim().min(8).max(256),
});
export type ConsentPayload = z.infer<typeof ConsentPayload>;

/** One inline image the message references as `cid:<contentId>`. */
export const Attachment = z.object({
  filename: z.string().regex(/^[a-z0-9._-]{1,64}$/i),
  type: z.enum(['image/png', 'image/jpeg']),
  contentId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  content: z
    .string()
    .regex(B64URL)
    .max(128 * 1024),
});
export type Attachment = z.infer<typeof Attachment>;

/** `POST /v1/send`: one rendered message to one mailbox, as SMTP would take it. */
export const SendPayload = Stamped.extend({
  to: Address,
  subject: z.string().max(512).transform(printable).pipe(z.string().min(1).max(256)),
  text: z
    .string()
    .min(1)
    .max(16 * 1024),
  html: z
    .string()
    .min(1)
    .max(64 * 1024),
  attachments: z.array(Attachment).max(1).default([]),
});
export type SendPayload = z.infer<typeof SendPayload>;

/** The first problem zod found, naming the field and never echoing the value. */
export function firstIssue(error: { issues: readonly z.core.$ZodIssue[] }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
