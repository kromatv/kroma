import { kroma } from '@kroma/bundler';
import { defineConfig, type UserConfig } from 'vite';

export default defineConfig(
  ({ command }): UserConfig => ({
    // This shell writes its own config rather than taking `tvShellConfig`, so
    // the workbench's `.docs.mdx` needs compiling here too: without it they
    // reach the JS parser as prose.
    plugins: [kroma({ mdx: true, alias: { '#tv': '../../packages/tv/src' } })],
    base: './',
    server: {
      host: true,
      port: 5178,
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
