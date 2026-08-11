import { useRouterState } from '@tanstack/react-router';
import {
  baseLocale,
  deLocalizeUrl,
  getLocale,
  locales,
  localizeUrl,
} from '#site/paraglide/runtime';

// The locale layer is Paraglide's; this module is the thin app-shaped adapter
// over it, so nothing else in the site imports a generated path.
//
// Paraglide runs with `strategy: ['url']` (see vite.config): the locale is a
// pure function of the pathname, which is what a prerendered static site
// needs — one language per URL, decided at build time.

export type Lang = (typeof locales)[number];

export { baseLocale as defaultLocale, getLocale, locales };

export const localeNames: Record<Lang, string> = { en: 'English', fr: 'Français' };
export const localeShort: Record<Lang, string> = { en: 'EN', fr: 'FR' };

// Paraglide's URL helpers parse absolute URLs, so a bare path needs an origin
// to be handed to them; it is discarded again, only the pathname is read back.
const ORIGIN = 'https://kroma.tv';

/** The locale a pathname belongs to: `/fr/blog` → `fr`, `/blog` → the base locale. */
export function langFromPath(pathname: string): Lang {
  const seg = pathname.split('/')[1] ?? '';
  return (locales as readonly string[]).includes(seg) ? (seg as Lang) : (baseLocale as Lang);
}

/** Strip the locale prefix to the canonical path: `/fr/blog` → `/blog`. */
export function canonicalPath(pathname: string): string {
  return deLocalizeUrl(new URL(pathname, ORIGIN)).pathname || '/';
}

/** Add a locale's prefix to a canonical path: `('/blog', 'fr')` → `/fr/blog`. The
 *  base locale stays unprefixed. */
export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const localized = localizeUrl(new URL(clean, ORIGIN), { locale: lang }).pathname || '/';
  // Slashless except at the site root: Cloudflare's `html_handling:
  // drop-trailing-slash` (wrangler.jsonc) redirects `/fr/download/`, and this
  // builds canonical/hreflang URLs that must not point at a redirect.
  // Paraglide spells a locale ROOT `/fr/`, the only spelling this changes.
  if (localized === '/' || !localized.endsWith('/')) return localized;
  return localized.slice(0, -1);
}

/** The active locale, from Paraglide's own resolver, NOT the router's
 *  pathname: the router is locale-blind, so `s.location.pathname` reads
 *  `/download` even on `/fr/download`. Needs no subscription because a locale
 *  change is a full document load - see the language switcher. */
export function useLang(): Lang {
  return getLocale();
}

/** The current pathname without its locale prefix, for the language switcher —
 *  it has to swap the prefix while keeping the reader on the same page. */
export function useCanonicalPath(): string {
  return useRouterState({ select: (s) => canonicalPath(s.location.pathname) });
}
