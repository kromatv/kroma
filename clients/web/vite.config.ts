import { kroma } from '@kromatv/bundler';
import { standaloneScript } from '@kromatv/bundler/standalone-script';
import { kromaModule } from '@kromatv/module-sdk/vite';
import { defineConfig } from 'vite';
import { swScript } from './sw.build.ts';

export default defineConfig({
  plugins: [
    kroma({
      alias: { '#web': './src' },
      dedupe: ['react-call'],
      start: { spa: { enabled: true } },
    }),
    kromaModule(),
    standaloneScript(swScript),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.KROMA_SERVER_URL ?? 'http://localhost:4040',
        changeOrigin: true,
        ws: true,
      },
      '/modules': {
        target: process.env.KROMA_SERVER_URL ?? 'http://localhost:4040',
        changeOrigin: true,
      },
    },
  },
});
