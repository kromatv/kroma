import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mdxPlugin } from './vite/mdx.ts';
import { ogPlugin } from './vite/og.tsx';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// The showcase site is a fully static build: every page reachable from the entry
// links is prerendered and Cloudflare serves dist/client with no server runtime.
export default defineConfig({
  plugins: [
    tailwindcss(),
    mdxPlugin(),
    ogPlugin(),
    tanstackStart({
      // No `spa` mode: it would mask `/` as a content-agnostic shell and
      // suppress the per-page HTML this content site needs for SEO.
      //
      // Cloudflare's `404-page` handling serves the nearest 404.html walking
      // up the path (so /fr/404.html is the French one); `autoSubfolderIndex:
      // false` writes `404.html` instead of `404/index.html`.
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
        // The prerenderer fetches pages from its own just-started local
        // server, and CI has lost that race twice in one day (connect
        // ETIMEDOUT/ECONNREFUSED on the first page). A failed page gets
        // retried instead of failing the build.
        retryCount: 3,
        retryDelay: 1000,
        // Two kinds of crawled href are not a page: in-page anchors and the
        // trailing-slash twin of a path already queued. The FIRST spelling of
        // a twin wins, not the slashless one: the route tree spells a
        // directory index `/blog/`, and only a link spells it `/blog`.
        //
        // Returning false only skips the render; marking `sitemap.exclude`
        // is what keeps it out of sitemap.xml.
        filter: (() => {
          const seen = new Set<string>();
          return (page: { path: string; sitemap?: { exclude?: boolean } }) => {
            const drop = () => {
              page.sitemap = { ...page.sitemap, exclude: true };
              return false;
            };
            if (page.path.includes('#')) return drop();
            // `endsWith` rather than `/(.)\/+$/`, which backtracks quadratically over a
            // long run of slashes.
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
    // Runs AFTER tanstackStart so the generated src/paraglide module exists before
    // the app graph is built.
    //
    // `strategy: ['url']` only: a cookie or an Accept-Language sniff would make the
    // locale a function of the REQUEST, and this site is prerendered to static
    // files, so a page must be one language per URL.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url'],
      // The generated output is JavaScript; without this `tsc` sees `any` for every
      // message function.
      emitTsDeclarations: true,
      // Listing `fr` FIRST matters: the patterns are matched in order and the `en`
      // entry is a catch-all that would otherwise swallow /fr/*.
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
    // bun installs per workspace, so React can otherwise be linked twice and hooks
    // blow up.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  // @kroma/ui ships raw TS source, so bundle it for SSR/prerender: Node cannot
  // import its `.ts` files directly.
  ssr: {
    noExternal: ['@kroma/ui'],
  },
});
