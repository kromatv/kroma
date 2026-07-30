#!/usr/bin/env bun
// What is actually IN the native bundle, by package, in a terminal.
//
// It exists because `bundle-check.ts` proves the bundle builds and prints its
// size, and a size alone never tells you what to do about it. The TV bundle was
// 9.4 MB of Hermes bytecode across 7370 modules and nobody could have guessed
// why: 69% of it was @tabler/icons-react-native, all 6171 glyphs, pulled in by a
// single namespace import in packages/ui/src/lib/icons/glyphs.ts. That import is
// deliberate and documented - but the note there measured the WEB cost (258 KB
// -> 740 KB gzipped) and the native cost had never been looked at, where the
// same line is worth 6 MB and 6000 modules.
//
// Expo Atlas collects this already; its UI is a web app you hover, which is no
// use over ssh or in CI. This reads the same dump and prints the one view that
// changes a decision: cost per package, biggest single modules.
//
//   EXPO_ATLAS=true node node_modules/.bin/expo export --platform ios   # in the client dir
//   bun clients/expo-build/atlas-report.ts clients/tv-native/.expo/atlas.jsonl
//   bun clients/expo-build/atlas-report.ts <file> --top 40
//
// Note the dump is per-export and OVERWRITTEN each time, so it always describes
// the last bundle you ran - export the client you mean to look at.

import { resolve } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: atlas-report.ts <path/to/atlas.jsonl> [--top N]');
  process.exit(2);
}
const at = args.indexOf('--top');
const TOP = at === -1 ? 25 : Number(args[at + 1] ?? 25);

type Module = {
  relativePath: string;
  size: number;
  output?: Array<{ data?: { code?: string } }>;
};

// The dump is two lines: a version header, then one array for the whole graph. Its shape is
// positional and undocumented, hence the names here: `[platform, projectRoot, workspaceRoot,
// entry, environment, runtime, modules, transformOptions, serializeOptions]`. The trap is index
// 5 - it holds the seven prelude/polyfill modules, and reading it INSTEAD of index 6 reports a
// healthy 122 KB bundle for a 16 MB one, which is exactly the wrong answer to get quietly. Both
// are counted below, because both ship.
const text = await Bun.file(resolve(file)).text();
const graph = JSON.parse(text.slice(text.indexOf('\n') + 1)) as unknown[];
const modules = [...(graph[5] as Module[]), ...(graph[6] as Module[])];

// `node_modules/foo/a.js` -> `foo`, `@a/b/c.js` -> `@a/b`, ours -> `packages/ui`.
// Bun's store nests real paths under `node_modules/.bun/<pkg>@<ver>/node_modules/`,
// so the LAST occurrence is the one that names the package.
function bucketOf(path: string): string {
  const marker = path.lastIndexOf('node_modules/');
  if (marker !== -1) {
    const parts = path.slice(marker + 'node_modules/'.length).split('/');
    return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : (parts[0] ?? '?');
  }
  const parts = path.split('/');
  if (parts[0] === 'packages' || parts[0] === 'clients') return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? '?';
}

// What a module contributes to the bundle is its TRANSFORMED output, not its
// source: a 3 KB .tsx of types and comments can compile to almost nothing, and
// a generated barrel does the opposite.
const outputOf = (mod: Module): number =>
  mod.output?.reduce((sum, part) => sum + (part.data?.code?.length ?? 0), 0) ?? 0;

type Row = { bucket: string; bytes: number; count: number };
const byBucket = new Map<string, Row>();
let total = 0;

for (const mod of modules) {
  const bytes = outputOf(mod);
  total += bytes;
  const bucket = bucketOf(mod.relativePath);
  const row = byBucket.get(bucket) ?? { bucket, bytes: 0, count: 0 };
  row.bytes += bytes;
  row.count += 1;
  byBucket.set(bucket, row);
}

const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;
const rows = [...byBucket.values()].sort((a, b) => b.bytes - a.bytes);

console.log(`\n  ${modules.length} modules, ${kb(total)} of transformed JS\n`);
console.log(
  `  ${'package'.padEnd(40)} ${'size'.padStart(9)} ${'%'.padStart(6)} ${'modules'.padStart(8)}`,
);
console.log(`  ${'-'.repeat(40)} ${'-'.repeat(9)} ${'-'.repeat(6)} ${'-'.repeat(8)}`);
for (const row of rows.slice(0, TOP)) {
  const share = ((row.bytes / total) * 100).toFixed(1);
  console.log(
    `  ${row.bucket.slice(0, 40).padEnd(40)} ${kb(row.bytes).padStart(9)} ${share.padStart(6)} ${String(row.count).padStart(8)}`,
  );
}
if (rows.length > TOP) {
  const rest = rows.slice(TOP).reduce((sum, row) => sum + row.bytes, 0);
  const more = `and ${rows.length - TOP} more`;
  console.log(`  ${more.padEnd(40)} ${kb(rest).padStart(9)}`);
}

// One fat file usually explains a whole bucket, and it is the thing you can act
// on - a barrel to import around, a locale to split, a polyfill nothing needs.
console.log('\n  biggest single modules\n');
const biggest = modules
  .map((mod) => ({ path: mod.relativePath, bytes: outputOf(mod) }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 12);
for (const mod of biggest) {
  // The bun store path is noise; the package and file are the signal.
  const shown = mod.path.replace(/^.*node_modules\/\.bun\/[^/]+\/node_modules\//, '');
  console.log(`  ${kb(mod.bytes).padStart(9)}  ${shown}`);
}
console.log('');
