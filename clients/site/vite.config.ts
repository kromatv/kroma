import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mdxPlugin } from './vite/mdx';
import { ogPlugin } from './vite/og';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// The showcase site is a fully STATIC build: TanStack Start prerenders every page
// it can reach from the entry links to its own HTML file, and Cloudflare serves
// the output (dist/client) from the edge with no server runtime — see
// wrangler.jsonc. The MDX pipeline lives in ./vite/mdx.ts.
export default defineConfig({
  plugins: [
    tailwindcss(),
    mdxPlugin(),
    // The per-locale Open Graph cards, rendered into dist/client by the build and
    // served from memory in dev. See vite/og.tsx for why they are not committed.
    ogPlugin(),
    tanstackStart({
      // Crawl the link graph from the entry and write each reachable route to its
      // own HTML file (dist/client/index.html, /download/index.html, …). The blog
      // index links every post, so dropping in an .mdx file is all it takes for
      // that post to be prerendered — no route or config to touch.
      //
      // No `spa` mode: it would mask `/` as a content-agnostic shell and suppress
      // the per-page HTML this content site needs for SEO. Cloudflare's
      // single-page-application fallback (wrangler.jsonc) serves the home HTML for
      // an unmatched path, which then client-renders the branded 404.
      // A real 404 document per locale, so an unknown path is a 404 rather than the home
      // page with a 200. Cloudflare's `404-page` handling serves the NEAREST 404.html
      // walking up the path, which is what makes /fr/404.html the French one.
      // `autoSubfolderIndex: false` is what writes `404.html` instead of `404/index.html`.
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
        // The crawl follows every href, and two kinds of href are not a page: the
        // header's in-page anchors (`/#fonctionnalites`) and the trailing-slash twin
        // of a path already queued (`/blog/` beside `/blog`). The prerenderer strips
        // the fragment before choosing a filename, so each one re-rendered a file
        // another entry had already written - but the SITEMAP is built from the raw
        // path, so it advertised `https://kroma.tv/#fonctionnalites` and a duplicate
        // `/blog/` to crawlers. Keep the first spelling of each real page.
        //
        // The twins are compared with any trailing slash removed, and the FIRST
        // spelling wins rather than the slashless one. That ordering is deliberate:
        // the route tree spells a directory index `/blog/` and only a link spells it
        // `/blog`, so preferring the slashless twin would drop any index route that
        // nothing happens to link to. The cost is that one sitemap URL keeps a
        // trailing slash its page's own canonical does not have, which a crawler
        // resolves through that canonical.
        //
        // Returning false only skips the RENDER: the crawler appends a discovered page
        // to the sitemap list before it consults this filter. It hands over the very
        // object the sitemap is built from, though, so marking it excluded here is
        // what actually keeps it out of sitemap.xml.
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
      // A sitemap.xml for the prerendered pages, hosted at the apex.
      sitemap: { enabled: true, host: 'https://kroma.tv' },
    }),
    react(),
    // Paraglide compiles messages/{locale}.json into tree-shakeable message
    // functions under src/paraglide (generated, git-ignored). It runs AFTER
    // tanstackStart so the generated module exists before the app graph is built.
    //
    // `strategy: ['url']` only, deliberately. A cookie or an Accept-Language
    // sniff would make the locale a function of the REQUEST, and this site is
    // prerendered to static files: a page must be one language per URL or the
    // HTML on the CDN would contradict itself. The URL is the single source of
    // truth, which is also what makes /fr indexable.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url'],
      // The generated output is JavaScript, so without this `tsc` sees `any` for
      // every message function and the runtime - which would quietly undo the
      // typesafety that is half the reason for choosing a compiler-based i18n.
      emitTsDeclarations: true,
      // English (the base locale) at the clean root, every other locale under its
      // own prefix. Listing `fr` FIRST matters: the patterns are matched in order
      // and the `en` entry is a catch-all that would otherwise swallow /fr/*.
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
    // blow up. @kroma/ui is consumed as raw source (below), so its React must be
    // this app's React.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Allow importing TS source from the workspace packages (@kroma/ui tokens).
    fs: { allow: [repoRoot] },
  },
  // @kroma/ui ships raw TS source, so bundle it for SSR/prerender rather than
  // externalizing it (Node cannot import its `.ts` files directly).
  ssr: {
    noExternal: ['@kroma/ui'],
  },
});
