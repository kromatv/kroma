import mdx from '@mdx-js/rollup';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import type { Plugin } from 'vite';
import { remarkReadingTime } from './reading-time';

// MDX must compile BEFORE the React transform, hence `enforce: 'pre'`.
// Frontmatter is lifted to `export const frontmatter` so the blog index can read
// a post's metadata without rendering it.
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
