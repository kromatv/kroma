import { DOC_SECTIONS, type DocSlug, docMarkdownPath } from '../src/lib/docs.ts';
import { rewriteDocUrl } from './doc-links.ts';

const FENCE = /^\s*(`{3,}|~{3,})/;
const CODE_SPAN = /(`+[^`]*`+)/;
const INLINE_LINK = /(\]\()([^()\s]+)((?:\s+"[^"]*")?\))/g;
const DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s+)(\S+)/;
const BLOCK_START = /^\s*(?:#|>|[-*+]\s|\d+[.)]\s|\||`{3,}|~{3,})/;

/** A guide's source with `rewrite` applied to every link target and link
 *  definition, and to nothing inside a code block or a code span. */
export function rewriteMarkdownLinks(source: string, rewrite: (url: string) => string): string {
  let fence: string | undefined;
  return source
    .split('\n')
    .map((line) => {
      const marker = FENCE.exec(line)?.[1];
      if (fence) {
        if (marker?.startsWith(fence)) fence = undefined;
        return line;
      }
      if (marker) {
        fence = marker;
        return line;
      }
      const definition = DEFINITION.exec(line);
      if (definition) {
        const [whole, lead = '', url = ''] = definition;
        return `${lead}${rewrite(url)}${line.slice(whole.length)}`;
      }
      return line
        .split(CODE_SPAN)
        .map((part) =>
          part.startsWith('`')
            ? part
            : part.replaceAll(
                INLINE_LINK,
                (_, open: string, url: string, close: string) => `${open}${rewrite(url)}${close}`,
              ),
        )
        .join('');
    })
    .join('\n');
}

const plain = (markdown: string): string =>
  markdown
    .replaceAll(/\[([^\][]*)\]\([^()]*\)/g, '$1')
    .replaceAll(/[`*]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** A guide's title and summary, read the way the site reads them: the first
 *  `#` heading and the first paragraph. */
export function docSummary(source: string): { title: string; description: string } {
  const lines = source.split('\n');
  const headingAt = lines.findIndex((line) => line.startsWith('# '));
  const title = headingAt === -1 ? '' : plain(lines[headingAt]?.slice(2) ?? '');
  const body = lines.slice(headingAt + 1);
  const start = body.findIndex((line) => line.trim() !== '' && !BLOCK_START.test(line));
  if (start === -1) return { title, description: '' };
  const end = body.findIndex((line, at) => at > start && line.trim() === '');
  return { title, description: plain(body.slice(start, end === -1 ? undefined : end).join(' ')) };
}

export interface AgentDocsInput {
  siteUrl: string;
  repoUrl: string;
  baseLocale: string;
  sources: Record<string, Partial<Record<DocSlug, string>>>;
  labels: Record<string, { name: string; summary: string; sections: Record<string, string> }>;
}

/** The files an agent reads instead of the pages, by site path: every guide as
 *  Markdown beside its page, and one `llms.txt` index per locale. A guide that
 *  has no translation is listed, and linked, in the base locale. */
export function agentDocs(input: Readonly<AgentDocsInput>): Map<string, string> {
  const { siteUrl, repoUrl, baseLocale, sources, labels } = input;
  const files = new Map<string, string>();

  for (const [lang, guides] of Object.entries(sources)) {
    const localeOf = (slug: DocSlug) =>
      [lang, baseLocale].find((locale) => sources[locale]?.[slug] !== undefined);
    const urlOf = (slug: DocSlug) => {
      const locale = localeOf(slug);
      return locale ? `${siteUrl}${docMarkdownPath(slug, locale)}` : undefined;
    };
    const rewrite = (url: string) => {
      const target = rewriteDocUrl(url, repoUrl);
      const guide = /^(\/docs(?:\/([\w-]+))?)(#.*)?$/.exec(target);
      if (!guide) return target;
      const [, path = '', slug = 'index', hash = ''] = guide;
      const page = urlOf(slug as DocSlug) ?? siteUrl + path;
      return `${page}${hash}`;
    };

    for (const [slug, source] of Object.entries(guides)) {
      files.set(docMarkdownPath(slug as DocSlug, lang), rewriteMarkdownLinks(source, rewrite));
    }

    const label = labels[lang];
    const index = [`# ${label?.name ?? ''}`, '', `> ${label?.summary ?? ''}`];
    for (const section of DOC_SECTIONS) {
      const entries = section.slugs.flatMap((slug) => {
        const locale = localeOf(slug);
        const source = locale && sources[locale]?.[slug];
        if (!source) return [];
        const { title, description } = docSummary(source);
        const link = `- [${title || slug}](${urlOf(slug)})`;
        return [description ? `${link}: ${description}` : link];
      });
      if (entries.length > 0) {
        index.push('', `## ${label?.sections[section.id] ?? section.id}`, '', ...entries);
      }
    }
    const prefix = lang === baseLocale ? '' : `/${lang}`;
    files.set(`${prefix}/llms.txt`, `${index.join('\n')}\n`);
  }

  return files;
}
