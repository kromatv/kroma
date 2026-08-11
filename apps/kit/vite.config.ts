import { fileURLToPath } from 'node:url';
import { collectBuildInfo } from '@kroma/build-info';
import { kromaMdx } from '@kroma/bundler/mdx';
import { propDocs } from '@kroma/bundler/props-docs';
import {
  KROMA_SOURCE_PACKAGES,
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  webResolve,
} from '@kroma/bundler/rnw';
import { kromaUI } from '@kroma/ui/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const kitDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  define: { __KROMA_BUILD__: JSON.stringify(collectBuildInfo(kitDir)), ...RNW_DEFINE },
  plugins: [
    kromaUI({ icons: 'full' }),
    // Before react(): a story's `.docs.mdx` has to be JSX before the React
    // transform sees it.
    kromaMdx(),
    react(),
    propDocs({ tsconfig: `${repoRoot}packages/ui/tsconfig.json` }),
    {
      name: 'kroma:watch-ui-stories',
      configureServer(server) {
        server.watcher.add(`${repoRoot}packages/ui/src`);
      },
    },
  ],
  resolve: webResolve(),
  base: '/',
  server: {
    port: 5180,
    fs: { allow: [repoRoot] },
  },
  optimizeDeps: {
    exclude: KROMA_SOURCE_PACKAGES,
    include: RNW_OPTIMIZE_INCLUDE,
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
  },
});
