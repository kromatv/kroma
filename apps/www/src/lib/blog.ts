import type { ComponentType } from 'react';
import { CONTENT_FALLBACK_LANG, groupByName, pickLocale } from '#site/lib/content-locale';
import type { Lang } from '#site/lib/i18n';

// Posts are keyed by slug (`content/blog/my-post.mdx`, `my-post.fr.mdx`); see
// lib/content-locale for the fallback rule.

interface RawFrontmatter {
  title?: string;
  date?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
  cover?: string;
  draft?: boolean;
}

export interface MdxModule {
  default: ComponentType<{ components?: Record<string, ComponentType> }>;
  frontmatter?: RawFrontmatter;
  readingMinutes?: number;
}

export interface PostMeta {
  slug: string;
  lang: Lang;
  translated: boolean;
  title: string;
  date: string;
  dateLabel: string;
  excerpt: string;
  author: string;
  tags: string[];
  cover?: string;
  readingMinutes: number;
}

export interface Post extends PostMeta {
  Component: MdxModule['default'];
}

// Memoized: a formatter is not cheap to build and every post in a list asks for one.
const formatters = new Map<Lang, Intl.DateTimeFormat>();
function formatDate(date: string, lang: Lang): string {
  let fmt = formatters.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    formatters.set(lang, fmt);
  }
  return fmt.format(new Date(date));
}

function resolve(
  slug: string,
  byLang: Partial<Record<Lang, MdxModule>>,
  lang: Lang,
): Post | undefined {
  const mod = pickLocale(byLang, lang);
  if (!mod) return undefined;
  const fm = { ...byLang[CONTENT_FALLBACK_LANG]?.frontmatter, ...mod.frontmatter };
  const date = fm.date ?? '1970-01-01';
  return {
    slug,
    lang,
    translated: Boolean(byLang[lang]),
    title: fm.title ?? slug,
    date,
    dateLabel: formatDate(date, lang),
    excerpt: fm.excerpt ?? '',
    author: fm.author ?? 'KROMA',
    tags: fm.tags ?? [],
    cover: fm.cover,
    readingMinutes: mod.readingMinutes ?? 1,
    Component: mod.default,
  };
}

/** The blog, over any map of MDX modules; drafts are served only in dev. */
export function createBlog(modules: Record<string, MdxModule>, isDev = import.meta.env.DEV) {
  const groups = groupByName(modules);

  function getAllPosts(lang: Lang): Post[] {
    const posts: Post[] = [];
    for (const [slug, byLang] of groups) {
      const post = resolve(slug, byLang, lang);
      if (!post) continue;
      if (!isDev && pickLocale(byLang, lang)?.frontmatter?.draft) continue;
      posts.push(post);
    }
    return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function getPost(slug: string, lang: Lang): Post | undefined {
    const byLang = groups.get(slug);
    return byLang ? resolve(slug, byLang, lang) : undefined;
  }

  return { getAllPosts, getPost };
}
