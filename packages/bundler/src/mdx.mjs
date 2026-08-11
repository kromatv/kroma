// MDX for the workbench's `<story>.docs.mdx` files: ONE set of compiler options,
// used by Vite (`@mdx-js/rollup`) and by Metro (`mdx-transformer.cjs`, which
// dynamic-imports this file). A doc that renders in a browser has to render the
// same way on a television, so the options cannot live in two places.
//
// Plain ESM `.mjs` rather than `.ts`: Metro's transformer is `require`d by
// worker processes running under plain node, which has no TypeScript loader,
// and those workers reach this file through `import()`. `mdx.d.mts` beside it
// is what the TypeScript hosts read.

import { compile } from '@mdx-js/mdx';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';

// hast keeps every newline an HTML author typed, because a browser collapses
// them. React Native does not: a newline inside a <Text> is a hard line break,
// and a string child of a view is an outright error. So a document written to a
// 80-column margin would read as one, and one written with blank lines between
// its blocks would crash. Both are fixed here, at compile time, rather than
// worked around in every component of the element map.
//
// Between BLOCKS the whitespace is nothing at all and goes.
const LAYOUT_PARENTS = new Set([
  'blockquote',
  'li',
  'ol',
  'root',
  'section',
  'table',
  'tbody',
  'thead',
  'tr',
  'ul',
]);

// Inside a `pre` or a `code` span the newlines ARE the content.
const VERBATIM = new Set(['code', 'pre']);

function isLayoutWhitespace(child) {
  return child.type === 'text' && /^\s*$/.test(child.value) && child.value.includes('\n');
}

function rehypeFixWhitespace() {
  return (tree) => {
    const walk = (node, verbatim) => {
      if (!Array.isArray(node.children)) return;
      const name = node.type === 'root' ? 'root' : node.tagName;
      if (LAYOUT_PARENTS.has(name)) {
        node.children = node.children.filter((child) => !isLayoutWhitespace(child));
      }
      const inside = verbatim || VERBATIM.has(name);
      for (const child of node.children) {
        // A soft wrap is a space, the way every other markdown renderer reads
        // it - and unlike a `br`, which arrives as an element of its own.
        // The leading run excludes the newline on purpose: `\s*\n\s*` lets the
        // engine split one stretch of whitespace many ways, which is quadratic
        // on a long one. This spelling has exactly one way to match.
        if (child.type === 'text' && !inside)
          child.value = child.value.replace(/[^\S\n]*\n\s*/g, ' ');
        walk(child, inside);
      }
    };
    walk(tree, false);
  };
}

/** The compiler options both bundlers use. GFM because tables, strikethrough
 * and task lists are the marks a component's documentation reaches for that
 * CommonMark has no spelling of. */
export const MDX_OPTIONS = {
  development: false,
  jsxRuntime: 'automatic',
  outputFormat: 'program',
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeFixWhitespace],
};

/** The Vite half. `enforce: 'pre'` because MDX must compile before the React
 * transform. */
export function kromaMdx() {
  return { enforce: 'pre', ...mdx(MDX_OPTIONS) };
}

/** One `.mdx` file compiled to JavaScript, for a caller that is not a bundler
 * plugin: Metro's transformer, and the test that checks the element map covers
 * everything MDX emits. */
export async function compileMdx(value, path) {
  return String(await compile({ path, value }, MDX_OPTIONS));
}
