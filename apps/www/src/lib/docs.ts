import type { ComponentType } from 'react';
import { CONTENT_FALLBACK_LANG, parseContentPath } from '#site/lib/content-locale';
import type { Lang } from '#site/lib/i18n';
import { BASE_LOCALE } from '#site/lib/locales';

/** The setup guides in reading order, by section of the sidebar. A slug is the
 *  file's name in the repository's docs/setup, and `index` is its README. */
export const DOC_SECTIONS = [
  { id: 'start', slugs: ['index'] },
  { id: 'server', slugs: ['docker', 'synology', 'other-nas', 'media-folders', 'first-run'] },
  {
    id: 'apps',
    slugs: ['tv', 'samsung-tv', 'lg-tv', 'android-tv', 'apple-tv', 'mobile', 'desktop'],
  },
  {
    id: 'operate',
    slugs: ['hardware-transcoding', 'network', 'updates', 'configuration', 'troubleshooting'],
  },
] as const;

export type DocSectionId = (typeof DOC_SECTIONS)[number]['id'];
export type DocSlug = (typeof DOC_SECTIONS)[number]['slugs'][number];

const ORDER: readonly DocSlug[] = DOC_SECTIONS.flatMap((s) => s.slugs);

export const isDocSlug = (slug: string): slug is DocSlug =>
  (ORDER as readonly string[]).includes(slug);

export interface DocModule {
  default: ComponentType<{ components?: Record<string, ComponentType> }>;
  title?: string;
  description?: string;
}

export interface Doc {
  slug: DocSlug;
  section: DocSectionId;
  lang: Lang;
  translated: boolean;
  title: string;
  description: string;
  path: string;
  markdown: string;
  source: string;
  Component: DocModule['default'];
}

export type DocMeta = Omit<Doc, 'Component'>;

/** The site path of a guide: `/docs` for the index, `/docs/<slug>` otherwise. */
export const docPath = (slug: DocSlug): string => (slug === 'index' ? '/docs' : `/docs/${slug}`);

/** The site path of a guide as Markdown, the file an agent reads: `/docs.md`
 *  for the index, `/docs/<slug>.md` otherwise, under the locale's prefix. */
export function docMarkdownPath(slug: DocSlug, lang: string): string {
  const prefix = lang === BASE_LOCALE ? '' : `/${lang}`;
  return `${prefix}${docPath(slug)}.md`;
}

/** A glob key resolved to its path in the repository, from the folder of the
 *  module that globbed it. */
export function repoPathOf(key: string, base: string): string {
  const parts = base.split('/').filter(Boolean);
  for (const segment of key.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

interface Version {
  mod: DocModule;
  source: string;
}

const sectionOf = (slug: DocSlug): DocSectionId =>
  DOC_SECTIONS.find((s) => (s.slugs as readonly string[]).includes(slug))?.id ?? 'start';

/** The guides over any map of compiled Markdown modules keyed by glob path:
 *  the English files of docs/setup and their translations in content/docs. */
export function createDocs(modules: Record<string, DocModule>, base: string) {
  const versions = new Map<DocSlug, Partial<Record<Lang, Version>>>();
  for (const [key, mod] of Object.entries(modules)) {
    const { name, lang } = parseContentPath(key);
    const slug = name === 'README' ? 'index' : name;
    if (!isDocSlug(slug)) continue;
    const byLang = versions.get(slug) ?? {};
    byLang[lang] = { mod, source: repoPathOf(key, base) };
    versions.set(slug, byLang);
  }

  function getDoc(slug: string, lang: Lang): Doc | undefined {
    if (!isDocSlug(slug)) return undefined;
    const byLang = versions.get(slug);
    const version = byLang?.[lang] ?? byLang?.[CONTENT_FALLBACK_LANG];
    if (!version) return undefined;
    return {
      slug,
      section: sectionOf(slug),
      lang,
      translated: Boolean(byLang?.[lang]),
      title: version.mod.title || slug,
      description: version.mod.description ?? '',
      path: docPath(slug),
      markdown: docMarkdownPath(slug, byLang?.[lang] ? lang : CONTENT_FALLBACK_LANG),
      source: version.source,
      Component: version.mod.default,
    };
  }

  function listed(): DocSlug[] {
    return ORDER.filter((slug) => versions.has(slug));
  }

  function neighbours(slug: DocSlug): { prev?: DocSlug; next?: DocSlug } {
    const order = listed();
    const at = order.indexOf(slug);
    if (at === -1) return {};
    return { prev: order[at - 1], next: order[at + 1] };
  }

  return { getDoc, listed, neighbours };
}
