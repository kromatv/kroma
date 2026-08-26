#!/usr/bin/env bun
// Props the kit allocates inside a list render: the worklist, worst first.
//
//   bun run kit:fanout            every component in the kit
//   bun run kit:fanout seek-bar   only files whose path contains the needle
//
// The rule is absolute and lives in audit.test.tsx: nothing may be allocated
// inside a list render. See packages/ui/audit/fanout-scan.ts for why the scan
// reads the React Compiler's output rather than the source.

import { scanKit } from '../audit/fanout-scan';

const ROOT = new URL('../../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const needle = args.find((a) => !a.startsWith('--')) ?? '';

const all = await scanKit(ROOT);
const allocs = needle ? all.filter((a) => a.file.includes(needle)) : all;

const byFile = new Map<string, typeof allocs>();
for (const alloc of allocs) byFile.set(alloc.file, [...(byFile.get(alloc.file) ?? []), alloc]);

console.log(`${allocs.length} allocations inside a list render, in ${byFile.size} files\n`);
for (const [file, list] of [...byFile].sort(([, a], [, b]) => b.length - a.length)) {
  console.log(`  ${String(list.length).padStart(3)}  ${file}`);
  for (const alloc of [...list].sort((a, b) => a.line - b.line)) {
    console.log(`         :${alloc.line}  ${alloc.prop}  (${alloc.kind})`);
  }
}
process.exit(0);
