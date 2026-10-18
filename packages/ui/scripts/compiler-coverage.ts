#!/usr/bin/env bun
// Which kit components the React Compiler actually memoises.
//
// The web shells and kit audit use Oxc's Rust React Compiler. Report its
// recoverable diagnostics as well as files that actually receive memo caches.
// Native Expo shells continue to use their supported Babel compiler pipeline.
//
//   bun run kit:compiler [path fragment]

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = resolve(ROOT, 'packages/ui/src');

const bundlerRequire = createRequire(resolve(ROOT, 'packages/bundler/package.json'));
const { compileReactSource } = bundlerRequire(
  '@kromatv/bundler/react-compiler-transform',
) as typeof import('@kromatv/bundler/react-compiler-transform');
const needle = process.argv[2] ?? '';

interface Skip {
  file: string;
  reason: string;
  loc: string;
}

const skips: Skip[] = [];
let memoizedFiles = 0;
let files = 0;

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
  const source = readFileSync(file, 'utf8');
  try {
    const result = compileReactSource(source, file, false, true);
    if (result?.code.includes('react/compiler-runtime')) memoizedFiles += 1;
    for (const error of result?.errors ?? []) {
      const offset = error.labels[0]?.start;
      const line =
        offset === undefined
          ? null
          : Buffer.from(source).subarray(0, offset).toString().split('\n').length;
      skips.push({
        file: relative(ROOT, file),
        reason: error.message,
        loc: line === null ? '' : `:${line}`,
      });
    }
  } catch (error) {
    skips.push({
      file: relative(ROOT, file),
      reason: error instanceof Error ? error.message : String(error),
      loc: '',
    });
  }
}

const byFile = new Map<string, Skip[]>();
for (const skip of skips) {
  byFile.set(skip.file, [...(byFile.get(skip.file) ?? []), skip]);
}

console.log(
  `${files} files · ${memoizedFiles} files with memo caches · ${skips.length} compiler diagnostics`,
);
for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file}`);
  for (const skip of list) console.log(`  ${skip.reason}${skip.loc}`);
}
process.exit(skips.length > 0 ? 1 : 0);
