#!/usr/bin/env bun
// Which kit components the React Compiler actually memoises.
//
// The shells run babel-plugin-react-compiler over the kit (see
// packages/bundler/src/shell.ts and clients/web/vite.config.ts), and the plugin
// SKIPS any component that breaks a rule of React - silently. A skipped
// component re-renders unmemoised on every screen that shows it, which is
// exactly the client CPU this repo's TVs do not have. This prints the skips,
// with the compiler's own reason, so they can be fixed instead of guessed at.
//
//   bun run kit:compiler            every component and hook in the kit
//   bun run kit:compiler seek-bar   only files whose path contains the needle

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = resolve(ROOT, 'packages/ui/src');

// The plugin belongs to @kroma/bundler (it is what the shells run), and babel
// itself is only reachable through the plugin's own tree: neither this package
// nor the bundler declares @babel/core directly.
const bundlerRequire = createRequire(resolve(ROOT, 'packages/bundler/package.json'));
const COMPILER = bundlerRequire.resolve('babel-plugin-react-compiler');
const pluginRequire = createRequire(COMPILER);
interface BabelCore {
  transformAsync(src: string, options: object): Promise<unknown>;
}
const { transformAsync } = pluginRequire('@babel/core') as BabelCore;
const PRESET_TS = pluginRequire.resolve('@babel/preset-typescript');
const needle = process.argv[2] ?? '';

interface Skip {
  file: string;
  reason: string;
  loc: string;
}

const skips: Skip[] = [];
let compiled = 0;
let files = 0;

const logger = {
  logEvent(filename: string | null, event: { kind: string; detail?: unknown; fnLoc?: unknown }) {
    if (event.kind === 'CompileSuccess') compiled += 1;
    if (event.kind !== 'CompileError') return;
    const detail = event.detail as {
      reason?: string;
      description?: string;
      loc?: { start?: { line?: number } };
      options?: { reason?: string; description?: string; loc?: { start?: { line?: number } } };
    };
    const at = detail.options ?? detail;
    skips.push({
      file: filename ? relative(ROOT, filename) : '?',
      reason: [at.reason, at.description].filter(Boolean).join(' - ') || event.kind,
      loc: at.loc?.start?.line ? `:${at.loc.start.line}` : '',
    });
  },
};

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(at);
    else if (/\.tsx?$/.test(entry.name)) yield at;
  }
}

for (const file of sources(SRC)) {
  const rel = relative(SRC, file);
  if (rel.includes('.test.') || rel.includes('.stories.') || rel.includes('.demo.')) continue;
  if (needle && !rel.includes(needle)) continue;
  files += 1;
  await transformAsync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [[PRESET_TS, { isTSX: true, allExtensions: true }]],
    plugins: [[COMPILER, { panicThreshold: 'none', logger }]],
  }).catch((error: Error) => {
    skips.push({ file: relative(ROOT, file), reason: error.message.split('\n')[0] ?? '', loc: '' });
  });
}

const byFile = new Map<string, Skip[]>();
for (const skip of skips) {
  byFile.set(skip.file, [...(byFile.get(skip.file) ?? []), skip]);
}

console.log(`${files} files · ${compiled} components/hooks memoised · ${skips.length} skipped`);
for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file}`);
  for (const skip of list) console.log(`  ${skip.reason}${skip.loc}`);
}
process.exit(skips.length > 0 ? 1 : 0);
