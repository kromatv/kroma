import { cloudflare } from '@cloudflare/vite-plugin';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { kroma } from '@kroma/bundler';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { mdxPlugin } from './vite/mdx.ts';
import { modulesPlugin } from './vite/modules.ts';
import { ogPlugin } from './vite/og.tsx';
import { releasesPlugin } from './vite/releases.ts';

const NOT_FOUND = {
  prerender: { enabled: true, autoSubfolderIndex: false },
  sitemap: { exclude: true },
};

// Prerender once per canonical path: a hash link or a trailing slash is the
// same page, and a duplicate would also be listed twice in the sitemap.
function onePerPath() {
  const seen = new Set<string>();
  return (page: { path: string; sitemap?: { exclude?: boolean } }) => {
    const drop = () => {
      page.sitemap = { ...page.sitemap, exclude: true };
      return false;
    };
    if (page.path.includes('#')) return drop();
    const key =
      page.path.length > 1 && page.path.endsWith('/') ? page.path.slice(0, -1) : page.path;
    if (seen.has(key)) return drop();
    seen.add(key);
    return true;
  };
}

export default defineConfig({
  plugins: [
    cloudflare({ configPath: './wrangler.jsonc', viteEnvironment: { name: 'ssr' } }),
    kroma({
      alias: { '#site': './src' },
      start: {
        pages: [
          { path: '/404', ...NOT_FOUND },
          { path: '/fr/404', ...NOT_FOUND },
        ],
        prerender: {
          enabled: true,
          crawlLinks: true,
          retryCount: 3,
          retryDelay: 1000,
          filter: onePerPath(),
        },
        sitemap: { enabled: true, host: 'https://kroma.tv' },
      },
    }),
    tailwindcss(),
    mdxPlugin(),
    modulesPlugin(),
    releasesPlugin(),
    ogPlugin(),
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
});
