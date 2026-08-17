// Cuts the one built package down to a single tier, into `dist-<tier>/`.
//
// `dist/` carries all three bundles and chooses between them at runtime, which
// is what one Store submission has to do: Samsung offers a package to a range of
// model groups and any of them may install it. A sideloaded set is the opposite
// case, and it is KROMA's normal one: the Tizen version is known before the
// widget is built, so the two bundles that set can never run are pure download.
//
// The gate goes with them, so a 2017 set also stops evaluating a probe written
// for engines it is not.
//
// Assets are kept by reachability rather than by rule: start at the tier's entry
// files and follow every `assets/<name>` mention, including from chunks reached
// that way, until nothing new turns up. The brand intro is referenced by all
// three tiers and stays in each, which is why a slice is ~10 MB and not ~3 MB.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Tier = 'modern' | 'legacy' | 'deep';

const TIERS: readonly Tier[] = ['modern', 'legacy', 'deep'];
const SHELL = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(SHELL, 'dist');
const TEXT = /\.(js|css|html|json)$/;

// Matched against the list rather than cast from it: what the rest of the file
// builds paths from is then one of these literals, never the argument.
const tier = TIERS.find((known) => known === process.argv[2]);
if (!tier) {
  console.error(`usage: slice.ts <${TIERS.join('|')}>`);
  process.exit(1);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`[slice] no build at ${DIST}. Run 'bun run build:tizen' first.`);
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// The gate is the only place the modern pair survives as hrefs; the older tiers
// are named by their directory.
function entryOf(which: Tier): { css: string; js: string } {
  if (which !== 'modern') return { css: `./${which}/style.css`, js: `./${which}/index.js` };
  const [, css, js] = /css = '([^']*)';[^\n]*\n[^\n]*src = '([^']*)';/.exec(html) ?? [];
  if (!css || !js) throw new Error('[slice] could not read the modern entry out of the gate');
  return { css, js };
}

const entry = entryOf(tier);
const local = (href: string) => join(DIST, href.replace('./', ''));

// Everything under assets/, by basename, so a mention matches whichever prefix
// the mentioning file happens to use.
const assets = new Map(
  existsSync(join(DIST, 'assets'))
    ? readdirSync(join(DIST, 'assets')).map((name) => [name, join(DIST, 'assets', name)] as const)
    : [],
);

const reached = new Set<string>();
const queue = [local(entry.css), local(entry.js)];
// Modulepreloads are the modern tier's other roots.
if (tier === 'modern') {
  for (const [, list] of html.matchAll(/var pre = (\[[^\]]*\]);/g)) {
    if (list) for (const href of JSON.parse(list) as string[]) queue.push(local(href));
  }
}

while (queue.length > 0) {
  const file = queue.pop();
  if (file === undefined || reached.has(file) || !existsSync(file)) continue;
  reached.add(file);
  if (!TEXT.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [name, path] of assets) {
    if (!reached.has(path) && text.includes(name)) queue.push(path);
  }
}

const OUT = join(SHELL, `dist-${tier}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });

for (const name of ['config.xml', 'icon.png', 'service']) {
  const from = join(DIST, name);
  if (existsSync(from)) cpSync(from, join(OUT, name), { recursive: true });
}
if (tier !== 'modern') cpSync(join(DIST, tier), join(OUT, tier), { recursive: true });
for (const file of reached) {
  if (file.startsWith(join(DIST, 'assets'))) cpSync(file, join(OUT, 'assets', basename(file)));
}

// One tier, loaded directly: no probe, and nothing to fall back to.
const asModule =
  tier === 'modern' ? "script.type = 'module';\n        script.crossOrigin = '';" : '';
const loader = `<script>
      (function () {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '${entry.css}';
        document.head.appendChild(link);
        var script = document.createElement('script');
        ${asModule}
        script.src = '${entry.js}';
        document.body.appendChild(script);
      })();
    </script>`;
// The gate is the last script in the body, so it is cut out by index rather
// than matched: a lazy `[\s\S]*?` before a lookahead rescans from every
// position in the document.
const head = html.slice(0, html.lastIndexOf('<script>'));
const tail = html.slice(html.lastIndexOf('</body>'));
writeFileSync(join(OUT, 'index.html'), `${head}${loader}\n  ${tail}`);

function sizeOf(dir: string): number {
  let total = 0;
  for (const item of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!item.isDirectory()) total += readFileSync(join(item.parentPath, item.name)).length;
  }
  return total;
}
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(`[slice] ${tier} -> dist-${tier}  ${mb(sizeOf(OUT))} (from ${mb(sizeOf(DIST))})`);
