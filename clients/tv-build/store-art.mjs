// Rasterises the KROMA brand lockup for the TV store packages.
//
// The lockup only exists as SVG (.github/assets), and neither store takes one:
// LG wants a PNG splash inside the .ipk, Samsung a transparent PNG logo plus a
// separate background it composites itself. Chromium is already a build
// dependency here (playwright drives the on-device checks), so it is what
// rasterises - no ImageMagick/librsvg to install, and the letterforms come out
// of the same engine that renders them in the app.
//
// Writes raw lockup PNGs to a work directory; store-art.py composes the actual
// deliverables from them. Run via `bun run store:art` at the repo root.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const REPO = new URL('../..', import.meta.url).pathname;

/** The output directory, proven to be inside the repo before anything is
 * created in it.
 *
 * `resolve()` canonicalizes the CLI argument but validates nothing - it will
 * hand back `/etc` just as readily as `.store-art`, and the next line is an
 * `mkdirSync`. Every documented invocation writes inside the checkout
 * (`.store-art`, `clients/tizen/store/shots`, `clients/webos/store/shots`), so
 * that is the boundary: a build script has no business creating directories
 * anywhere else on the machine that runs it. */
function outDirIn(repo, arg, usage) {
  if (!arg) throw new Error(usage);
  const root = resolve(repo);
  const dir = resolve(root, arg);
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to write outside the repo: ${dir}`);
  }
  return dir;
}

const OUT_DIR = outDirIn(REPO, process.argv[2], 'usage: store-art.mjs <out-dir>');
mkdirSync(OUT_DIR, { recursive: true });

/** Resolve a file INTO the output directory, refusing anything that climbs out.
 *
 * The directory is a CLI argument and the file names are literals below, so this
 * is a guard on future edits as much as on today's input: `join()` will happily
 * walk out of the directory it was handed, and a build script writing outside
 * the place it was pointed at is the failure worth making impossible. */
function outPath(name) {
  const full = resolve(OUT_DIR, name);
  if (full !== OUT_DIR && !full.startsWith(`${OUT_DIR}${sep}`)) {
    throw new Error(`refusing to write outside ${OUT_DIR}: ${name}`);
  }
  return full;
}

/** Render an SVG file at an exact pixel size, on a transparent canvas. The SVG
 * is inlined into a bare page sized to match, so the screenshot is the artwork
 * and nothing else (no scrollbars, no default margin). */
async function raster(page, svgPath, width, height, out) {
  const svg = readFileSync(resolve(REPO, svgPath), 'utf8')
    .replace(/\swidth="[^"]*"/, ` width="${width}"`)
    .replace(/\sheight="[^"]*"/, ` height="${height}"`);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block}</style>${svg}`,
    { waitUntil: 'load' },
  );
  const shot = await page.screenshot({ omitBackground: true, type: 'png' });
  writeFileSync(outPath(out), shot);
  console.log(`${out}  ${width}x${height}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// The bare wordmark + wheel, ivory on transparent. 458x100 source, rendered at
// 4x so it stays crisp when composed down onto a 1920x1080 canvas.
await raster(page, '.github/assets/kroma-lockup-ivory.svg', 1832, 400, 'lockup-ivory.png');

await browser.close();
