import { dirname, relative, sep } from 'node:path';
import { FIRST_PAINT_FONTS } from './tokens.ts';

interface HtmlTag {
  tag: 'link';
  attrs: Record<string, string>;
  injectTo: 'head-prepend';
}

interface DevConfig {
  root: string;
  base?: string;
}

interface HtmlContext {
  filename: string;
  server?: { config: DevConfig };
}

interface PreloadPlugin {
  name: string;
  transformIndexHtml: {
    order: 'pre';
    handler(html: string, ctx: HtmlContext): HtmlTag[];
  };
}

const toUrlPath = (path: string) => path.split(sep).join('/');

const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path}`;

const servedUrl = (file: string, { root, base = '/' }: DevConfig) => {
  const inside = `${toUrlPath(root).replace(/\/+$/, '')}/`;
  const path = toUrlPath(file);
  return joinUrl(base, path.startsWith(inside) ? path.slice(inside.length) : `@fs${path}`);
};

const fromHtml = (file: string, html: string) => {
  const path = toUrlPath(relative(dirname(html), file));
  return path.startsWith('.') ? path : `./${path}`;
};

const link = (href: string): HtmlTag => ({
  tag: 'link',
  attrs: {
    rel: 'preload',
    href,
    as: 'font',
    type: 'font/woff2',
    // Load-bearing even same-origin: a font is always fetched in CORS mode, so
    // a preload without it does not match and the file is requested twice.
    crossorigin: 'anonymous',
  },
  injectTo: 'head-prepend',
});

/**
 * Puts a `<link rel="preload">` for {@link FIRST_PAINT_FONTS} at the top of
 * every `index.html`, which is the precondition `font-display: optional` is
 * declared under: with no swap period, a face that misses the ~100ms block
 * period is dropped for the life of the page.
 *
 * The href is written the way Vite reads one, not the way it ships: a path
 * relative to the html for a build, so the build rewrites it to the same
 * fingerprinted asset the stylesheet's `src` resolves to, and the dev server's
 * own `/@fs` URL otherwise.
 */
export function kromaFontPreload(): PreloadPlugin {
  return {
    name: 'kroma-font-preload',
    transformIndexHtml: {
      order: 'pre',
      handler: (_html, ctx) =>
        FIRST_PAINT_FONTS.map((file) =>
          link(ctx.server ? servedUrl(file, ctx.server.config) : fromHtml(file, ctx.filename)),
        ),
    },
  };
}
