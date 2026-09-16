import { z } from 'zod';

export const Locale = z.enum(['en', 'fr']);
export type Locale = z.infer<typeof Locale>;

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A mailbox, lowercased so two spellings of one inbox share one budget. */
export const Address = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(ADDRESS, 'not an address');

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|\[f[cd][0-9a-f]{2}:[^\]]*\]|.+\.(local|lan|home\.arpa))$/i;

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
  return url.protocol === 'http:' && PRIVATE_HOST.test(url.hostname);
}

/** The server a grant is bound to. A trailing slash is forgiven, nothing else. */
export const Origin = z
  .string()
  .trim()
  .max(256)
  .transform((s) => s.replace(/\/+$/, ''))
  .refine(isOrigin, 'not an origin');

const printable = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The one thing a server gets to say in a consent email, flattened to one printable line. */
export const ServerName = z.string().max(256).transform(printable).pipe(z.string().min(1).max(64));

/** `POST /v1/enrol`: a server asks the relay to ask a mailbox for consent. */
export const EnrolRequest = z.object({
  address: Address,
  origin: Origin,
  serverName: ServerName,
  locale: Locale.catch('en'),
  token: z.string().trim().min(8).max(256),
});
export type EnrolRequest = z.infer<typeof EnrolRequest>;

/** `POST /v1/send`: a server spends a grant on one rendered message. */
export const SendRequest = z.object({
  grant: z.string().min(1).max(4096),
  subject: z.string().max(512).transform(printable).pipe(z.string().min(1).max(256)),
  text: z
    .string()
    .min(1)
    .max(16 * 1024),
  html: z
    .string()
    .min(1)
    .max(64 * 1024),
});
export type SendRequest = z.infer<typeof SendRequest>;

/** The first problem zod found, naming the field and never echoing the value. */
export function firstIssue(error: { issues: readonly z.core.$ZodIssue[] }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
