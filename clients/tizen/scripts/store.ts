import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(SHELL, 'dist');
const OUT = join(SHELL, 'dist-store');

const CUTS = [
  ['<!--', '-->'],
  ['<tizen:service', '</tizen:service>'],
  ['<tizen:metadata key="http://samsung.com/tv/metadata/use.preview"', '/>'],
] as const;

const PARTNER_ONLY = ['<tizen:service', 'use.preview'] as const;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`[store] no build at ${DIST}. Run 'bun run build:tizen' first.`);
  process.exit(1);
}

function cut(xml: string, open: string, close: string): string {
  let out = xml;
  let at = out.indexOf(open);
  while (at !== -1) {
    const end = out.indexOf(close, at);
    if (end === -1) break;
    const head = out.slice(0, at).trimEnd();
    out = head + out.slice(end + close.length);
    at = out.indexOf(open, head.length);
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
cpSync(DIST, OUT, { recursive: true, filter: (from) => !from.endsWith('.wgt') });
rmSync(join(OUT, 'service'), { recursive: true, force: true });

const manifest = join(OUT, 'config.xml');
let xml = readFileSync(manifest, 'utf8');
for (const [open, close] of CUTS) xml = cut(xml, open, close);

const survivor = PARTNER_ONLY.find((mark) => xml.includes(mark));
if (survivor) {
  console.error(`[store] ${survivor} survived in dist-store/config.xml`);
  process.exit(1);
}

writeFileSync(manifest, xml);
console.log('[store] dist-store: every tier, no <tizen:service>, no Smart Hub preview');
