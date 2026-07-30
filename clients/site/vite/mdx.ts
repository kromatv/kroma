import mdx from '@mdx-js/rollup';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import type { Plugin } from 'vite';
import { remarkReadingTime } from './reading-time';

// The MDX pipeline, kept out of vite.config.ts so the config stays a thin wiring
// file. MDX must compile BEFORE the React transform (enforce: 'pre'). Frontmatter
// is lifted to `export const frontmatter` (remark-mdx-frontmatter) so the blog
// index can read a post's title/date/excerpt without rendering it; GFM gives
// tables and task lists; rehype-slug + rehype-pretty-code give anchored headings
// and Shiki-highlighted code blocks in the deep charcoal theme.
export function mdxPlugin(): Plugin {
  return {
    enforce: 'pre',
    ...mdx({
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm, remarkReadingTime],
      rehypePlugins: [
        rehypeSlug,
        [rehypePrettyCode, { theme: 'github-dark-default', keepBackground: false }],
      ],
    }),
  } as Plugin;
}
