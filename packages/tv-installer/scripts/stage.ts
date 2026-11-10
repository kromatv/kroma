import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { site } from '@kromatv/site-meta';
import { $ } from 'bun';
import { z } from 'zod';
import { tv } from '../src/cli.ts';
import { PUBLISHED_PACKAGE } from '../src/published.ts';
import { injectUsage, renderUsage } from '../src/usage.ts';

const PACKAGE = PUBLISHED_PACKAGE;
const COMMAND = 'kroma-tv';
const NODE_SHEBANG = '#!/usr/bin/env node\n';
const BUN_PREAMBLE = /^#!.*\n(?:\/\/ @bun\n)?/;

const Workspace = z.object({
  license: z.string(),
  author: z.string(),
  repository: z.object({ type: z.string(), url: z.string(), directory: z.string() }),
});

const pkgRoot = join(import.meta.dir, '..');
const out = join(pkgRoot, 'dist', 'npm');

const { values } = parseArgs({ options: { version: { type: 'string', default: '0.0.0' } } });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const cli = join(out, 'cli.js');
const stamped = `process.env.KROMA_TV_VERSION=${JSON.stringify(values.version)}`;
await $`bun build ./src/bin.ts --target=node --define ${stamped} --outfile ${cli}`
  .cwd(pkgRoot)
  .quiet();
const bundle = await readFile(cli, 'utf8');
await writeFile(cli, `${NODE_SHEBANG}${bundle.replace(BUN_PREAMBLE, '')}`);
await chmod(cli, 0o755);

const workspace = Workspace.parse(
  JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8')),
);
const manifest = {
  name: PACKAGE,
  version: values.version,
  description:
    'Finds the Samsung, LG and Android TV sets on your network and installs KROMA on them, from the latest release.',
  keywords: ['kroma', 'tv', 'tizen', 'webos', 'android-tv', 'sideload', 'installer'],
  license: workspace.license,
  author: workspace.author,
  repository: workspace.repository,
  homepage: `${site.links.installGuide}/tv`,
  bugs: site.links.issues,
  type: 'module',
  bin: { [COMMAND]: 'cli.js' },
  files: ['cli.js'],
  engines: { node: '>=22.12.0' },
  os: ['darwin', 'linux'],
  publishConfig: { access: 'public' },
};
await writeFile(join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const commands = typeof tv.subCommands === 'function' ? tv.subCommands() : tv.subCommands;
const { docs: _docs, ...published } = (await commands) ?? {};
const usage = await renderUsage({ ...tv, subCommands: published }, `npx ${PACKAGE}`);
const readme = await readFile(join(pkgRoot, 'npm', 'README.md'), 'utf8');
await writeFile(join(out, 'README.md'), injectUsage(readme, usage));
await cp(join(pkgRoot, '../..', 'LICENSE'), join(out, 'LICENSE'));

await $`npm pack --silent`.cwd(out).quiet();
console.log(`staged ${PACKAGE}@${values.version} into ${out}`);
