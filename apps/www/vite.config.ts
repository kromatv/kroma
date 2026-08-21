import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { kromaUI } from '@kroma/ui/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mdxPlugin } from './vite/mdx.ts';
import { modulesPlugin } from './vite/modules.ts';
import { ogPlugin } from './vite/og.tsx';
import { releasesPlugin } from './vite/releases.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [
    cloudflare({ configPath: './wrangler.jsonc', viteEnvironment: { name: 'ssr' } }),
    kromaUI(),
    tailwindcss(),
    mdxPlugin(),
    modulesPlugin(),
    releasesPlugin(),
    ogPlugin(),
    tanstackStart({
      pages: [
        {
          path: '/404',
          prerender: { enabled: true, autoSubfolderIndex: false },
          sitemap: { exclude: true },
        },
        {
          path: '/fr/404',
          prerender: { enabled: true, autoSubfolderIndex: false },
          sitemap: { exclude: true },
        },
      ],
      prerender: {
        enabled: true,
        crawlLinks: true,
        retryCount: 3,
        retryDelay: 1000,
        filter: (() => {
          const seen = new Set<string>();
          return (page: { path: string; sitemap?: { exclude?: boolean } }) => {
            const drop = () => {
              page.sitemap = { ...page.sitemap, exclude: true };
              return false;
            };
            if (page.path.includes('#')) return drop();
            const p = page.path;
            const key = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
            if (seen.has(key)) return drop();
            seen.add(key);
            return true;
          };
        })(),
      },
      sitemap: { enabled: true, host: 'https://kroma.tv' },
    }),
    react(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url'],
      emitTsDeclarations: true,
      urlPatterns: [
        {
          pattern: '/:path(.*)?',
          localized: [
            ['fr', '/fr/:path(.*)?'],
            ['en', '/:path(.*)?'],
          ],
        },
      ],
    }),
  ],
  resolve: {
    alias: [{ find: '#site', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  ssr: {
    noExternal: ['@kroma/ui'],
  },
});
