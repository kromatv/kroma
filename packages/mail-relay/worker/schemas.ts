import { z } from 'zod';

export const Locale = z.enum(['en', 'fr']);
export type Locale = z.infer<typeof Locale>;

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

function privateHost(hostname: string): boolean {
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
  return url.protocol === 'http:' && privateHost(url.hostname);
}

function withoutTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** The server a grant is bound to. A trailing slash is forgiven, nothing else. */
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

/** The one thing a server gets to say in a consent email, flattened to one printable line. */
export const ServerName = z.string().max(256).transform(printable).pipe(z.string().min(1).max(64));

/** A locale the relay speaks; anything else, or nothing, reads as English. */
const LocaleOrEnglish = z
  .unknown()
  .transform((value): Locale => Locale.safeParse(value).data ?? 'en');

/** `POST /v1/enrol`: a server asks the relay to ask a mailbox for consent. */
export const EnrolRequest = z.object({
  address: Address,
  origin: Origin,
  serverName: ServerName,
  locale: LocaleOrEnglish,
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
