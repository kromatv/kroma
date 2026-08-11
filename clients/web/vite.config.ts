import { fileURLToPath } from 'node:url';
import { buildInfoPlugin } from '@kroma/bundler/build-info';
import { exitAfterBuild } from '@kroma/bundler/exit-after-build';
import {
  RNW_DEFINE,
  RNW_OPTIMIZE_INCLUDE,
  RNW_SSR_NO_EXTERNAL,
  webResolve,
} from '@kroma/bundler/rnw';
import { standaloneScript } from '@kroma/bundler/standalone-script';
import { kromaModule } from '@kroma/module-sdk/vite';
import { kromaUI } from '@kroma/ui/vite';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { swScript } from './sw.build.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const apiTarget = process.env.KROMA_SERVER_URL ?? 'http://localhost:4040';

export default defineConfig({
  define: RNW_DEFINE,
  plugins: [
    kromaUI(),
    kromaModule(),
    buildInfoPlugin({ projectRoot: fileURLToPath(new URL('.', import.meta.url)) }),
    standaloneScript(swScript),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    exitAfterBuild(),
  ],
  resolve: webResolve({ '#web': fileURLToPath(new URL('./src', import.meta.url)) }, ['react-call']),
  server: {
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  ssr: {
    noExternal: ['@kroma/ui', '@kroma/core', ...RNW_SSR_NO_EXTERNAL],
    optimizeDeps: { include: ['@kroma/ui > react-tv-space-navigation'] },
  },
  optimizeDeps: {
    exclude: ['@kroma/ui', '@kroma/core'],
    include: RNW_OPTIMIZE_INCLUDE,
  },
});
