import { fileURLToPath } from 'node:url';
import { kroma } from '@kroma/bundler';
import { gitHistory } from '@kroma/bundler/git-history';
import { propDocs } from '@kroma/bundler/props-docs';
import { storyCode } from '@kroma/bundler/story-code';
import { kromaIconCatalog } from '@kroma/ui/vite/icon-catalog';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [
    kroma({ mdx: true }),
    kromaIconCatalog(),
    propDocs({ tsconfig: `${repoRoot}packages/ui/tsconfig.json` }),
    storyCode({ tsconfig: `${repoRoot}packages/ui/tsconfig.json`, repo: repoRoot }),
    gitHistory({ repo: repoRoot, root: 'packages/ui/src' }),
    {
      name: 'kroma:watch-ui-stories',
      configureServer(server) {
        server.watcher.add(`${repoRoot}packages/ui/src`);
      },
    },
  ],
  base: '/',
  server: {
    port: 5180,
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
  },
});
