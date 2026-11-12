import mdx from '@mdx-js/rollup';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { site } from '@kromatv/site-meta';
import type { Plugin } from 'vite';
import { remarkAlerts } from './alerts.ts';
import { remarkDocLinks } from './doc-links.ts';
import { remarkDocMeta } from './doc-meta.ts';
import { remarkReadingTime } from './reading-time.ts';

// MDX must compile BEFORE the React transform, hence `enforce: 'pre'`.
// Frontmatter is lifted to `export const frontmatter` so the blog index can read
// a post's metadata without rendering it.
export function mdxPlugin(): Plugin {
  return {
    enforce: 'pre',
    ...mdx({
      remarkPlugins: [
        remarkFrontmatter,
        remarkMdxFrontmatter,
        remarkGfm,
        remarkAlerts,
        [remarkDocLinks, { repoUrl: site.repo }],
        remarkDocMeta,
        remarkReadingTime,
      ],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypePrettyCode,
          {
            theme: { dark: 'github-dark-default', light: 'github-light-default' },
            keepBackground: false,
          },
        ],
      ],
    }),
  } as Plugin;
}
