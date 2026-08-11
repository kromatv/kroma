import type { Lang } from '#site/lib/i18n';
import { LOCALES } from '#site/lib/locales';

// The naming convention every folder of localized content in this package
// follows:
//
//   content/blog/my-post.mdx        the default-language version (the fallback)
//   content/blog/my-post.fr.mdx     the French translation of that same document
//   content/legal/privacy.en.mdx    an explicit suffix is allowed too
//
// The blog and the legal pages have different data shapes, so they stay
// separate loaders; this module holds only what they share: the filename
// convention and the fallback rule.

// Deliberately English, and independent of the site's base UI locale: a
// document is authored once in English and translated afterwards, so a reader
// in any other language falls back to the English text, not a missing page.
export const CONTENT_FALLBACK_LANG: Lang = 'en';

const isLang = (s: string): s is Lang => LOCALES.includes(s);

/** Split a content path into the document's name and its locale:
 *  `my-post.fr.mdx` → `{ name: 'my-post', lang: 'fr' }`. A trailing segment
 *  that is not a known locale is part of the name, so `release.2.mdx` is the
 *  document `release.2`, not `release` in a locale called `2`. */
export function parseContentPath(path: string): { name: string; lang: Lang } {
  const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx$/, '');
  const parts = file.split('.');
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  if (last && isLang(last)) return { name: parts.slice(0, -1).join('.'), lang: last };
  return { name: file, lang: CONTENT_FALLBACK_LANG };
}

/** The version of a document to serve for a locale: the translation when it
 *  exists, the fallback language otherwise, any version before nothing. */
export function pickLocale<T>(byLang: Partial<Record<Lang, T>>, lang: Lang): T | undefined {
  return byLang[lang] ?? byLang[CONTENT_FALLBACK_LANG] ?? Object.values(byLang)[0];
}

/** Group content modules by document name, then by locale. */
export function groupByName<T>(modules: Record<string, T>): Map<string, Partial<Record<Lang, T>>> {
  const map = new Map<string, Partial<Record<Lang, T>>>();
  for (const [path, mod] of Object.entries(modules)) {
    const { name, lang } = parseContentPath(path);
    const byLang = map.get(name) ?? {};
    byLang[lang] = mod;
    map.set(name, byLang);
  }
  return map;
}
