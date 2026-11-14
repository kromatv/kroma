// Scaffolds a sign-in preset: `bun run server:preset <id> --name … --issuer …
// --docs … --mark <set:name | file.svg | file.png>`. What goes in a preset, and what its
// button may look like, is in
// server/crates/kroma-engine/src/services/sso/presets/README.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const PRESETS = new URL('./crates/kroma-engine/src/services/sso/presets/', import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    label: { type: 'string' },
    issuer: { type: 'string' },
    docs: { type: 'string' },
    console: { type: 'string' },
    mark: { type: 'string' },
    'group-claim': { type: 'string' },
    icon: { type: 'string' },
  },
});

const [id] = positionals;
const { name, issuer, docs, mark } = values;
if (!id || !name || !issuer || !docs || !mark) {
  console.error(
    'usage: bun run server:preset <id> --name <name> --issuer <https address> --docs <https address> --mark <set:name | file.svg | file.png>\n' +
      '       [--label <text>] [--console <https address>] [--group-claim <claim>] [--icon <glyph>]',
  );
  process.exit(2);
}
if (!/^[a-z0-9-]{1,32}$/.test(id)) {
  console.error(`"${id}" is not a preset id: lower-case letters, digits and dashes, 32 at most.`);
  process.exit(2);
}

const folder = new URL(`${id}/`, PRESETS);
if (existsSync(folder)) {
  console.error(`presets/${id} is already there.`);
  process.exit(1);
}

type Drawn = { file: string; body: string | Uint8Array; source: string };

async function readMark(from: string): Promise<Drawn> {
  const source = `TODO: where ${from} was downloaded from, and its licence`;
  if (from.endsWith('.png')) return { file: 'mark.png', body: readFileSync(from), source };
  if (from.endsWith('.svg')) return { file: 'mark.svg', body: withNewline(readFileSync(from, 'utf8')), source };
  const [set, icon] = from.split(':');
  const address = `https://api.iconify.design/${set}/${icon}.svg`;
  const answer = await fetch(address);
  if (!answer.ok) throw new Error(`${address} answered ${answer.status}`);
  const svg = (await answer.text()).replace(/(<svg[^>]*?) width="[^"]*" height="[^"]*"/, '$1');
  const day = new Date().toISOString().slice(0, 10);
  return {
    file: 'mark.svg',
    body: withNewline(svg),
    source: `Iconify \`${from}\`, via ${address}, read ${day}. TODO: the set's licence`,
  };
}

function withNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

const drawn = await readMark(mark);
const manifest = {
  name,
  ...(values.label ? { label: values.label } : {}),
  ...(values.icon ? { icon: values.icon } : {}),
  issuer,
  ...(values['group-claim'] ? { groupClaim: values['group-claim'] } : {}),
  ...(values.console ? { console: values.console } : {}),
  docs,
  ...(drawn.file === 'mark.svg' ? {} : { mark: drawn.file }),
  sources: { mark: drawn.source, issuer: `${docs}, read ${new Date().toISOString().slice(0, 10)}` },
};

mkdirSync(folder, { recursive: true });
writeFileSync(new URL('preset.json', folder), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(new URL(drawn.file, folder), drawn.body);

console.log(`presets/${id} written. Finish its sources, then check it:`);
console.log('  cd server && cargo test -p kroma-engine presets');
