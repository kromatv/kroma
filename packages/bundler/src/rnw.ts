// react-native-web wiring, shared by every browser target (Tizen, webOS,
// Android TV's WebView shell, the Tauri desktop app and the web client).
//
// @kroma/ui and the screens built on it are authored against React Native.
// On the browser targets that module specifier has to land on react-native-web,
// and `.web.*` files have to win over their native siblings. Those two rules are
// the ENTIRE web/native split: keeping them in one place is what stops the four
// shells from drifting into four slightly different bundler setups.

import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

/** Extension order. `.web.*` first, mirroring what Metro does in reverse for the
 * native apps (it prefers `.ios` / `.android` / `.native` and never sees these). */
export const WEB_EXTENSIONS = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.json',
  '.mjs',
];

/**
 * Build a shell's `resolve` block. `alias` is the shell's own path aliases (e.g.
 * `#tv`); the react-native redirect is appended last. `extraDedupe` names any
 * further single-instance package the shell needs (the web client adds
 * `react-call`, whose callables keep a module-level store).
 *
 * The redirect is an anchored RegExp on purpose: a plain string alias also
 * matches subpath imports, so `react-native/Libraries/...` would silently become
 * `react-native-web/Libraries/...` and fail to resolve with a confusing error.
 */
/** `@kroma/ui`'s own internal subpath alias, declared in its package.json
 * `imports` and mirrored here. Every web target gets it for free, because it is
 * the kit's own spelling of its own files - a shell should not have to know that
 * the kit refers to itself as `#ui`. The Metro half lives in
 * clients/expo-build/metro-workspace.js, and tsconfig.base.json carries the
 * types. */
const KIT_SRC = fileURLToPath(new URL('../../ui/src', import.meta.url));

export function webResolve(
  alias: Record<string, string> = {},
  extraDedupe: string[] = [],
): UserConfig['resolve'] {
  return {
    alias: [
      ...Object.entries(alias).map(([find, replacement]) => ({ find, replacement })),
      { find: /^#ui\//, replacement: `${KIT_SRC}/` },
      { find: /^react-native$/, replacement: 'react-native-web' },
      // The icon set is authored against @tabler/icons-react-native, because that
      // is the half that cannot be substituted on a television. The SAME
      // component names and props ship as DOM <svg> in @tabler/icons-react, which
      // is what a browser wants - and landing there keeps react-native-svg's
      // runtime out of the TV bundles entirely, for the reason lib/svg.web.tsx
      // spells out. Anchored, like the redirect above, so a deep import cannot
      // silently follow it. See packages/ui/src/icons/glyphs.ts.
      { find: /^@tabler\/icons-react-native$/, replacement: '@tabler/icons-react' },
      // react-native-web deep-imports inline-style-prefixer's Babel-CJS `lib/`
      // build (which in turn deep-imports css-in-js-utils the same way), whose
      // `exports.default` doesn't survive Node's CJS→ESM interop when the
      // package is externalized in SSR (`.default` lands one level deeper, so
      // `createPrefixer` arrives as undefined and the dev server 500s on every
      // request). Both packages ship a mirrored ESM build under `es/`; land
      // there instead. Their relative imports are extensionless, so the SSR
      // shell must also keep both packages in `ssr.noExternal`.
      {
        find: /^(inline-style-prefixer|css-in-js-utils)\/lib\/(.*)$/,
        replacement: '$1/es/$2',
      },
    ],
    extensions: WEB_EXTENSIONS,
    // bun installs per workspace, so React can otherwise be linked twice (once
    // for the shell, once for a package it depends on) and hooks blow up.
    dedupe: ['react', 'react-dom', 'react-native-web', ...extraDedupe],
  };
}

/** react-native-web is CommonJS and pulls a deep tree; pre-bundling it keeps the
 * dev server's module graph small enough for a TV's slow connection. */
export const RNW_OPTIMIZE_INCLUDE = ['react-native-web'];

/**
 * The packages an SSR target must NOT externalize, as a consequence of the
 * aliases above.
 *
 * It lives here rather than being hand-copied into the one shell that renders on
 * a server, because it is not a fact about that shell: `webResolve` aliases
 * inline-style-prefixer and css-in-js-utils to their ESM `es/` builds, whose
 * relative imports are extensionless and therefore only resolve through Vite,
 * and it lands react-tv-space-navigation's bare `require('react-native')` on
 * react-native-web. An alias whose precondition is remembered in a different
 * file is an alias that eventually 500s with `createPrefixer is undefined` the
 * day a second SSR target appears.
 */
export const RNW_SSR_NO_EXTERNAL = [
  'react-native-web',
  'inline-style-prefixer',
  'css-in-js-utils',
  'react-tv-space-navigation',
];

/**
 * The workspace packages a dev server must serve from SOURCE.
 *
 * Left out of Vite's pre-bundle: they are the repo's own code, and pre-bundling
 * them means an edit to one is invisible until the cache is cleared. Kept as one
 * list because a source package missing from a shell's copy is a dev server
 * quietly serving a stale build of it - which is what happened to
 * `@kroma/workbench` on the TV shells.
 */
export const KROMA_SOURCE_PACKAGES = ['@kroma/ui', '@kroma/core', '@kroma/tv', '@kroma/workbench'];

/**
 * react-native-web's Animated implementation reads the React Native `global`,
 * which no browser defines: without this, every Animated component throws
 * `ReferenceError: global is not defined` the moment it unmounts and tries to
 * stop its animation. That is the pulsing skeleton, the spinner, the brand
 * wheel, the settings switch and the text caret, so the whole screen goes with
 * them.
 *
 * `globalThis` is the standard spelling of what React Native means by `global`,
 * and it exists on every engine this app ships to, including the Chromium 53
 * legacy webOS tier (it is ES2020, which that tier's build already down-levels).
 */
export const RNW_DEFINE = { global: 'globalThis' };
