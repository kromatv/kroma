// Metro's babel transformer, wrapped for the two rewrites Metro cannot do on
// its own. A `.mdx` file is compiled to a React component before babel ever
// sees it:
//
//   import Docs from './list-row.docs.mdx'   ->   a component
//
// and the kit's `WEB` platform constant is collapsed to a literal (see
// inline-platform.cjs), so Metro's own constant folding deletes web-only
// branches from a release bundle the way it already deletes `Platform.OS` ones.
//
// Vite spells that `@mdx-js/rollup`; `babelTransformerPath` is Metro's
// equivalent hook, which is why a story's `.docs.mdx` renders on a television
// and not only in a browser. `resolver.sourceExts` has to name `mdx` too, or
// the file is not in Metro's file map at all - see
// clients/expo-build/metro-workspace.ts.
//
// It lives HERE rather than beside that config because `@mdx-js/mdx` is
// ESM-only and resolves from the file importing it: this package declares it,
// and `clients/expo-build` is not a package with anything to resolve from.
//
// `.cjs`: a transformer is `require`d by Metro's worker processes, which run
// under plain node with no TypeScript loader. The compiler options themselves
// live in `mdx.mjs`, shared with the Vite half.

// The transformer this one wraps. Metro forwards none of its own config to a
// babel transformer, and `@expo/metro-config` is a transitive dependency of the
// CLIENT, so the path travels through the environment the workers inherit.
const UPSTREAM = 'KROMA_METRO_BABEL_TRANSFORMER';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { inlinePlatformConst } = require('./inline-platform.cjs');

let loading;

function upstream() {
  const at = process.env[UPSTREAM];
  if (!at) {
    throw new Error(
      `${UPSTREAM} is not set: this transformer only wraps another one, and ` +
        'expoWorkspaceConfig is what hands it the path.',
    );
  }
  return require(at);
}

// Cached as the PROMISE, so concurrent transforms in one worker load the ESM
// compiler once.
function compiler() {
  loading ??= import('./mdx.mjs');
  return loading;
}

async function transform({ src, filename, options, plugins }) {
  let source = src;
  if (filename.endsWith('.mdx')) {
    const { compileMdx } = await compiler();
    source = await compileMdx(src, filename);
  }
  source = inlinePlatformConst(source, options.platform);
  return upstream().transform({ src: source, filename, options, plugins });
}

// Hashed rather than versioned by hand. Metro's transform cache keys on this,
// and a `.mdx` already compiled stays compiled: without the hash, editing the
// options in mdx.mjs leaves every native bundle serving the output of the
// options before the edit, with nothing to say so.
function getCacheKey() {
  const parent = upstream();
  const inherited = typeof parent.getCacheKey === 'function' ? parent.getCacheKey() : '';
  const own = createHash('sha256')
    .update(readFileSync(__filename))
    .update(readFileSync(join(__dirname, 'mdx.mjs')))
    .update(readFileSync(join(__dirname, 'story-scenes.mjs')))
    .digest('hex');
  return `${inherited}$${own}`;
}

module.exports = { getCacheKey, transform };
