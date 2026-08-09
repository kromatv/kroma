// The design-system showcase: the @kroma/ui workbench as its own website, not
// a TV shell - targets developers' browsers directly, so none of the TV
// shells' legacy tiers or CSS down-leveling apply.

import { fileURLToPath } from 'node:url';
import { propDocs } from '@kroma/bundler/props-docs';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  webResolve,
} from '@kroma/bundler/rnw';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { collectBuildInfo } from '../build-info';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const kitDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Which build the site is; the kit app gets the same object through Expo's
  // `extra` (see app.config.ts). Its own package version, not the product's.
  define: { __KROMA_BUILD__: JSON.stringify(collectBuildInfo(kitDir)), ...RNW_DEFINE },
  // The Props tab's data, read by TypeScript's checker over @kroma/ui at build
  // time and served as `virtual:kroma-props`.
  plugins: [
    react(),
    propDocs({ tsconfig: `${repoRoot}packages/ui/tsconfig.json` }),
    {
      name: 'kroma:watch-ui-stories',
      // packages/ui sits outside this app's watch root, so chokidar never saw
      // a NEW *.stories.tsx / *.demo.tsx there and the registry glob could not
      // re-run without a restart. Watching the directory is the whole fix:
      // vite's own glob-import plugin matches the add/unlink event against the
      // registry's `import.meta.glob` and reloads with the file discovered.
      configureServer(server) {
        server.watcher.add(`${repoRoot}packages/ui/src`);
      },
    },
  ],
  resolve: webResolve(),
  // Absolute, not './': the workbench routes on real paths (`/story/button`),
  // and a relative base would resolve asset URLs against that path instead.
  base: '/',
  server: {
    port: 5180,
    fs: { allow: [repoRoot] },
  },
  optimizeDeps: {
    // Workspace packages left OUT of this list get pre-bundled into
    // node_modules/.vite/deps and served from that cache, so an edit to the
    // tool itself would not reach the dev server until invalidated.
    exclude: KROMA_SOURCE_PACKAGES,
    include: RNW_OPTIMIZE_INCLUDE,
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
  },
});
