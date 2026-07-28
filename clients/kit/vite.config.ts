// The design-system showcase: the @kroma/ui workbench as its own website.
//
// This is NOT a TV shell. It exists so anyone can open the kit in a browser
// (or CI can deploy it as a static site) without booting a platform app and
// remembering `?workbench`. It targets developers' browsers, so none of the
// TV shells' legacy tiers or CSS down-leveling apply; the react-native-web
// wiring is the same one every browser target shares.

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { collectBuildInfo } from '../build-info';
import { propDocs } from '../tv-build/props-docs';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  webResolve,
} from '../tv-build/rnw';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const kitDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Which build the site is, for the line under the story tree. The kit app gets
  // the same object through Expo's `extra`; see app.config.js. Its own package
  // version, not the product's: this ships the design system, not the player.
  define: { __KROMA_BUILD__: JSON.stringify(collectBuildInfo(kitDir)), ...RNW_DEFINE },
  // The Props tab's data, read by TypeScript's own checker over @kroma/ui at
  // build time and served as `virtual:kroma-props`. See the plugin for why this
  // is not a regex in the browser any more.
  plugins: [react(), propDocs({ tsconfig: `${repoRoot}packages/ui/tsconfig.json` })],
  resolve: webResolve(),
  // Absolute, not './'. The workbench routes on REAL PATHS (`/story/button`), and
  // a relative base resolves every asset URL against the current directory - so
  // `/story/button` would ask for `/story/assets/index.js` and get nothing.
  base: '/',
  server: {
    port: 5180,
    fs: { allow: [repoRoot] },
    // The story registry is an import.meta.glob over packages/ui, which is
    // outside this app's watch root: EDITING a story hot-reloads, but ADDING
    // a brand-new *.stories.tsx needs a dev-server restart to be discovered.
  },
  optimizeDeps: {
    // Every workspace package, @kroma/workbench above all: left OUT of this list
    // Vite pre-bundles it into node_modules/.vite/deps and then serves that
    // CACHE, so an edit to the tool itself does not reach the dev server until
    // the cache happens to be invalidated. See `KROMA_SOURCE_PACKAGES`.
    exclude: KROMA_SOURCE_PACKAGES,
    include: RNW_OPTIMIZE_INCLUDE,
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
  },
});
