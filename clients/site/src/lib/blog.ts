import type { ComponentType } from 'react';
import { CONTENT_FALLBACK_LANG, groupByName, pickLocale } from '#site/lib/content-locale';
import type { Lang } from '#site/lib/i18n';

// The blog is a folder of .mdx files with a smart per-file language convention:
//
//   content/blog/my-post.mdx        the DEFAULT version (the fallback)
//   content/blog/my-post.fr.mdx     the French translation of that same post
//
// A post is keyed by its SLUG (`my-post`), shared across languages, so the URL
// and the language switcher line up (/blog/my-post <-> /fr/blog/my-post). For a
// requested locale we serve `<slug>.<lang>.mdx` when it exists and fall back to
// `<slug>.mdx` otherwise: a reader ALWAYS gets the post, translated where a
// translation was written, in the default language where it was not. Nothing is
// ever hidden for lack of a translation.
//
// The filename convention and the fallback rule are lib/content-locale's, shared
// with the legal pages; what stays here is the shape of a post.
//
// The files themselves are discovered by an eager glob, which lives in lib/posts - the
// one line that needs a bundler. Everything here is a pure function of the module map
// it is given, which is what makes the rules above testable without compiling MDX.

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
  /** The language actually served (the requested one, or the fallback). */
  lang: Lang;
  /** True when a translation for the requested language existed; false when the
   *  reader is seeing the fallback-language version. */
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

// Our locale codes are valid BCP-47 tags, so Intl needs no per-language table and a
// new language needs no entry here. Memoized because a formatter is not cheap to
// build and every post in a list asks for one.
const formatters = new Map<Lang, Intl.DateTimeFormat>();
function formatDate(date: string, lang: Lang): string {
  let fmt = formatters.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    formatters.set(lang, fmt);
  }
  return fmt.format(new Date(date));
}

/** Resolve a slug for a language: the translation if present, else the fallback,
 *  else any version that exists. Missing frontmatter fields on a translation are
 *  inherited from the fallback file, so a `.fr.mdx` can carry only what changed. */
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

/**
 * The blog, over any map of MDX modules.
 *
 * Separated from the glob below so the resolution logic - the translation fallback, the
 * inherited frontmatter, the ordering, the draft rule - is unit-testable without the
 * MDX pipeline. Discovering the files needs a bundler; deciding what to do with them
 * does not, and that is the half worth testing.
 */
export function createBlog(modules: Record<string, MdxModule>, isDev = import.meta.env.DEV) {
  // slug -> (lang -> module), the grouping the resolver reads from.
  const groups = groupByName(modules);

  /** Every post for a language (newest first). A post whose served version is a draft
   *  is hidden outside the dev server. */
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

  /** One post by slug for a language, with the same translation fallback. */
  function getPost(slug: string, lang: Lang): Post | undefined {
    const byLang = groups.get(slug);
    return byLang ? resolve(slug, byLang, lang) : undefined;
  }

  return { getAllPosts, getPost };
}
