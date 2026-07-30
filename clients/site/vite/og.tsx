import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { render } from 'takumi-js';
import { Renderer } from 'takumi-js/node';
import type { Plugin } from 'vite';
import { OgCard } from './og-card';
import { OG_CARDS } from './og-cards';

// The Open Graph social cards, one PNG per locale, RENDERED BY THE BUILD.
//
// They used to be two 190 KB PNGs written by a `bun run og` script and committed under
// `public/`, which made a build artefact a tracked source file: the card went stale
// silently whenever the tokens, the fonts or the wording moved, and the only thing keeping
// it honest was remembering to run a script by hand. Here they are emitted straight into
// `dist/client` by the client build and served from memory in dev, so the card is derived
// from the same sources as the pages that link to it, every time, and there is no file in
// the repo to drift.
//
// JSX -> PNG with Takumi (a Rust renderer), in this process: no browser, no network, no
// subprocess. Takumi reads a VARIABLE font's `fvar` table, which is why there are no font
// files in this package - the previous renderer could not, and needed static 400/600
// instances of the kit's variable Hanken committed here and regenerated with fontTools by
// hand. The card is a component, ./og-card.tsx.

/**
 * The kit's own font files, the same two faces the pages load.
 *
 * Resolved through the package NAME, never by walking up out of this package: @kroma/ui is
 * a dependency of @kroma/site and exports `./src/assets/*`, so this asks Node where that
 * dependency's file is and gets an answer that survives the package moving. The require is
 * based on this package's own package.json rather than `import.meta.url`, which the config
 * loader rewrites to a binding it defines only for the config file itself.
 */
const kitFont = (root: string, file: string) =>
  createRequire(join(root, 'package.json')).resolve(`@kroma/ui/src/assets/fonts/${file}`);

/** One renderer per process, both faces registered once. */
function rendererFactory(getRoot: () => string) {
  let ready: Promise<Renderer> | undefined;
  return () => {
    ready ??= (async () => {
      const root = getRoot();
      const renderer = new Renderer();
      const [display, ui] = await Promise.all([
        readFile(kitFont(root, 'BricolageGrotesque-ExtraBold.ttf')),
        readFile(kitFont(root, 'HankenGrotesk.ttf')),
      ]);
      await renderer.registerFont({ name: 'Bricolage Grotesque', data: display, weight: 800 });
      // No `weight` on the variable file: pinning one collapses its axes, and the card's
      // 400 and 600 runs would then both render at that single weight.
      await renderer.registerFont({ name: 'Hanken Grotesk', data: ui });
      return renderer;
    })();
    return ready;
  };
}

async function renderCard(
  card: (typeof OG_CARDS)[keyof typeof OG_CARDS],
  renderer: Renderer,
): Promise<Buffer> {
  const png = await render(<OgCard title={card.title} sub={card.sub} />, {
    renderer,
    // `width`/`height` are the OUTPUT pixels and `devicePixelRatio` scales the layout into
    // them, so this is the card's 1200x630 design laid out once and rasterized @2x - sharp
    // where a platform renders it large. Passing 1200x630 with a ratio of 2 would instead
    // draw the layout at twice its size and crop it.
    width: 2400,
    height: 1260,
    devicePixelRatio: 2,
    // PNG rather than the smaller WebP: the only consumers are social scrapers and not all
    // of them decode WebP.
    format: 'png',
  });
  return Buffer.from(png);
}

export function ogPlugin(): Plugin {
  let root = process.cwd();
  const getRenderer = rendererFactory(() => root);

  // One render per card per process, shared by the dev middleware and the build:
  // rasterizing at 2x is the expensive half, and nothing a card is drawn from can change
  // without restarting the process that loaded this module.
  const cache = new Map<string, Promise<Buffer>>();
  const cardFor = (file: string) => {
    const card = Object.values(OG_CARDS).find((c) => c.file === file);
    if (!card) return undefined;
    let png = cache.get(file);
    if (!png) {
      png = getRenderer().then((renderer) => renderCard(card, renderer));
      cache.set(file, png);
    }
    return png;
  };

  return {
    name: 'kroma:og',

    configResolved(config) {
      root = config.root;
    },

    // Dev serves the cards at the same paths the built site uses, so a card debugger
    // pointed at `bun run dev` sees the real image rather than a 404 that only exists
    // outside production.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = req.url?.split('?')[0]?.replace(/^\//, '') ?? '';
        const png = cardFor(file);
        if (!png) return next();
        png
          .then((body) => {
            res.setHeader('content-type', 'image/png');
            res.setHeader('cache-control', 'no-cache');
            res.end(body);
          })
          .catch(next);
      });
    },

    // The client build is the one whose output Cloudflare serves (dist/client) and the only
    // environment that should carry the asset; the server/prerender build would write a
    // second, unreachable copy.
    async generateBundle() {
      if (this.environment?.name !== 'client') return;
      for (const card of Object.values(OG_CARDS)) {
        const png = await cardFor(card.file);
        if (!png) continue;
        this.emitFile({ type: 'asset', fileName: card.file, source: png });
      }
    },
  };
}
