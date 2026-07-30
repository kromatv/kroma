import type { ComponentType } from 'react';
import { groupByName, pickLocale } from '#site/lib/content-locale';
import type { Lang } from '#site/lib/i18n';

// The legal documents (today: the privacy policy) are MDX files, one per
// locale (content/legal/privacy.en.mdx, privacy.fr.mdx). Prose, not UI
// strings, so they are not in the Paraglide catalogs. The naming convention
// and fallback rule are lib/content-locale's; a policy has no frontmatter,
// date or draft state, so this stays its own tiny loader over an eager glob.

interface LegalModule {
  default: ComponentType;
}

const modules = import.meta.glob<LegalModule>('../../content/legal/*.mdx', { eager: true });
const docs = groupByName(modules);

/** The rendered component for a legal document in a locale: the translation
 *  when it exists, the fallback-locale version otherwise, `undefined` only
 *  when no file for that name exists at all. */
export function getLegalDoc(name: string, lang: Lang): ComponentType | undefined {
  const byLang = docs.get(name);
  return byLang ? pickLocale(byLang, lang)?.default : undefined;
}
