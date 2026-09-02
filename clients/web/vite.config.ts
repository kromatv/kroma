import { kroma } from '@kroma/bundler';
import { standaloneScript } from '@kroma/bundler/standalone-script';
import { kromaModule } from '@kroma/module-sdk/vite';
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
    },
  },
});
