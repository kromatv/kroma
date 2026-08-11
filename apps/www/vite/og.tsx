import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { render } from 'takumi-js';
import { Renderer } from 'takumi-js/node';
import type { Plugin } from 'vite';
import { OgCard } from './og-card.tsx';
import { OG_CARDS } from './og-cards.ts';

// The Open Graph social cards, one PNG per locale, emitted into `dist/client`
// by the client build and served from memory in dev. JSX -> PNG with Takumi
// (a Rust renderer) in this process: no browser, no network, no subprocess.

// Resolved through the package name rather than by walking up out of this
// package. Based on this package's own package.json rather than
// `import.meta.url`, which the config loader rewrites for the config file only.
const kitFont = (root: string, file: string) =>
  createRequire(join(root, 'package.json')).resolve(`@kroma/ui/src/assets/fonts/${file}`);

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
    // them: the 1200x630 design rasterized @2x. Passing 1200x630 with a ratio of 2 would
    // instead draw the layout at twice its size and crop it.
    width: 2400,
    height: 1260,
    devicePixelRatio: 2,
    // PNG rather than the smaller WebP: not every social scraper decodes WebP.
    format: 'png',
  });
  return Buffer.from(png);
}

export function ogPlugin(): Plugin {
  let root = process.cwd();
  const getRenderer = rendererFactory(() => root);

  // One render per card per process, shared by the dev middleware and the build.
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
    // pointed at `bun run dev` sees the real image rather than a 404.
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

    // Only the client build's output is served (dist/client); the server/prerender build
    // would write a second, unreachable copy.
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
