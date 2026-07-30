import type { Lang } from '#site/lib/i18n';
import { LOCALES } from '#site/lib/locales';

// The one naming convention every folder of localized content in this package
// follows, and the two operations that convention implies.
//
//   content/blog/my-post.mdx        the default-language version (the fallback)
//   content/blog/my-post.fr.mdx     the French translation of that same document
//   content/legal/privacy.en.mdx    an explicit suffix is allowed too
//
// The blog and the legal pages have genuinely different DATA shapes - a post has
// frontmatter, a date, an excerpt and a draft flag; a policy has none of that - so
// they stay separate loaders. What they share is this: how a filename encodes a
// locale, and what to serve when the requested locale has no translation. Both were
// written twice, which is one definition too many for a rule the content authors
// have to be able to rely on.

/**
 * The locale a `<name>.mdx` with no `.lang` suffix is assumed to be in, and the
 * version served when the requested locale has no translation.
 *
 * Deliberately ENGLISH, and deliberately independent of the site's base UI locale:
 * a document is authored once in English and translated afterwards, so a reader in
 * any other language falls back to the English text rather than to a missing page.
 */
export const CONTENT_FALLBACK_LANG: Lang = 'en';

const isLang = (s: string): s is Lang => LOCALES.includes(s);

/**
 * Split a content path into the document's name and its locale:
 * `../content/blog/my-post.fr.mdx` → `{ name: 'my-post', lang: 'fr' }`, and
 * `../content/blog/my-post.mdx` → `{ name: 'my-post', lang: CONTENT_FALLBACK_LANG }`.
 *
 * A trailing segment that is not a known locale is part of the name, so
 * `release.2.mdx` is the document `release.2` rather than a document `release` in a
 * locale called `2`.
 */
export function parseContentPath(path: string): { name: string; lang: Lang } {
  const file =
    path
      .split('/')
      .pop()
      ?.replace(/\.mdx$/, '') ?? path;
  const parts = file.split('.');
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  if (last && isLang(last)) return { name: parts.slice(0, -1).join('.'), lang: last };
  return { name: file, lang: CONTENT_FALLBACK_LANG };
}

/**
 * The version of a document to serve for a locale: the translation when it exists,
 * the fallback language otherwise, and any version at all before nothing - a
 * document is never hidden for lack of a translation.
 */
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
