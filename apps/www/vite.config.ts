import { cloudflare } from '@cloudflare/vite-plugin';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { kroma } from '@kromatv/bundler';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { landPlugin } from './vite/land.ts';
import { llmsPlugin } from './vite/llms.ts';
import { mdxPlugin } from './vite/mdx.ts';
import { modulesPlugin } from './vite/modules.ts';
import { BASE_LOCALE, LOCALES } from './src/lib/locales.ts';
import { ogPlugin } from './vite/og.tsx';
import { releasesPlugin } from './vite/releases.ts';

function notFound(prefix: string) {
  return {
    path: `${prefix}/404`,
    prerender: { enabled: true, autoSubfolderIndex: false },
    sitemap: { exclude: true },
  };
}

const PREFIXED = LOCALES.filter((locale) => locale !== BASE_LOCALE);

// Prerender once per canonical path: a hash link or a trailing slash is the
// same page, and a duplicate would also be listed twice in the sitemap.
function onePerPath() {
  const seen = new Set<string>();
  return (page: { path: string; sitemap?: { exclude?: boolean } }) => {
    const drop = () => {
      page.sitemap = { ...page.sitemap, exclude: true };
      return false;
    };
    if (page.path.includes('#')) {
      return drop();
    }
    const key =
      page.path.length > 1 && page.path.endsWith('/') ? page.path.slice(0, -1) : page.path;
    if (seen.has(key)) {
      return drop();
    }
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
        pages: ['', ...PREFIXED.map((locale) => `/${locale}`)].map(notFound),
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
    landPlugin(),
    modulesPlugin(),
    releasesPlugin(),
    ogPlugin(),
    llmsPlugin(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url'],
      emitTsDeclarations: true,
      urlPatterns: [
        {
          pattern: '/:path(.*)?',
          localized: [
            ...PREFIXED.map((locale): [string, string] => [locale, `/${locale}/:path(.*)?`]),
            [BASE_LOCALE, '/:path(.*)?'],
          ],
        },
      ],
    }),
  ],
});
