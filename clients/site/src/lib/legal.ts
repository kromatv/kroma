import type { ComponentType } from 'react';
import { groupByName, pickLocale } from '#site/lib/content-locale';
import type { Lang } from '#site/lib/i18n';

// The legal documents (today: the privacy policy) are MDX files, one per locale:
//
//   content/legal/privacy.en.mdx     the English text
//   content/legal/privacy.fr.mdx     the French text
//
// They are prose, not UI strings, so they do NOT belong in the Paraglide catalogs:
// a policy is a structured document with headings, lists, bold clauses and links,
// and it is reviewed as a whole rather than sentence by sentence. Markdown is the
// format a legal text should be edited in; a `.json` value is not.
//
// The naming convention and the fallback rule are lib/content-locale's, the same ones
// the blog follows, so a translator learns one rule for every folder of content. What
// is NOT shared is the data shape: a policy has no frontmatter, no date and no draft
// state, so this stays its own tiny loader over an eager glob rather than a
// generalisation of the blog's.

interface LegalModule {
  default: ComponentType;
}

const modules = import.meta.glob<LegalModule>('../../content/legal/*.mdx', { eager: true });

// name -> (lang -> module), built once from the glob.
const docs = groupByName(modules);

/**
 * The rendered component for a legal document in a locale: the translation when it
 * exists, the fallback-locale version otherwise, and `undefined` only when no file
 * for that name exists at all.
 */
export function getLegalDoc(name: string, lang: Lang): ComponentType | undefined {
  const byLang = docs.get(name);
  return byLang ? pickLocale(byLang, lang)?.default : undefined;
}
