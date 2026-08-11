import { fileURLToPath } from 'node:url';
import { kromaMdx } from '@kroma/bundler/mdx';
import { RNW_DEFINE, RNW_OPTIMIZE_INCLUDE, webResolve } from '@kroma/bundler/rnw';
import { buildDefine } from '@kroma/bundler/shell';
import { kromaUI } from '@kroma/ui/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const shellDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(
  ({ command }): UserConfig => ({
    // This shell writes its own config rather than taking `tvShellConfig`, so
    // the workbench's `.docs.mdx` needs compiling here too: without it they
    // reach the JS parser as prose.
    plugins: [kromaUI(), kromaMdx(), react()],
    define: { ...buildDefine(repoRoot, shellDir), ...RNW_DEFINE },
    resolve: webResolve({
      '#tv': fileURLToPath(new URL('../../packages/tv/src', import.meta.url)),
    }),
    base: './',
    server: {
      host: true,
      port: 5178,
      fs: { allow: [repoRoot] },
    },
    optimizeDeps: {
      exclude: ['@kroma/ui', '@kroma/core', '@kroma/tv'],
      include: RNW_OPTIMIZE_INCLUDE,
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      cssCodeSplit: false,
      modulePreload: { polyfill: false },
      reportCompressedSize: true,
      rollupOptions: { output: { manualChunks: undefined } },
    },
    esbuild: {
      drop: command === 'build' ? ['console', 'debugger'] : [],
      legalComments: 'none',
    } as UserConfig['esbuild'],
  }),
);
