#!/usr/bin/env bun
// Hand-written useMemo and useCallback the React Compiler's output is the same
// without: the worklist.
//
//   bun run kit:memo           every memo hook in the kit
//   bun run kit:memo select    only files whose path contains the needle
//
// An inert hook is not always one to remove, and one that changes the output is
// not always one to keep. See packages/ui/audit/README.md.

import { scanTrees } from '../audit/memo-scan';
import { compiler, ROOT } from './audit-target';

const needle = process.argv[2] ?? '';

const all = await scanTrees(compiler(), ROOT, ['packages/ui/src']);
const sites = needle ? all.filter((site) => site.file.includes(needle)) : all;

const byFile = new Map<string, typeof sites>();
for (const site of sites) {
  byFile.set(site.file, [...(byFile.get(site.file) ?? []), site]);
}
const inert = sites.filter((site) => site.inert).length;

console.log(
  `${sites.length} memo hooks in ${byFile.size} files · ${inert} inert, ${sites.length - inert} change the compiled output\n`,
);
for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${file}`);
  for (const site of list) {
    const verdict = site.inert ? 'inert' : 'changes the output';
    console.log(
      `    :${String(site.line).padEnd(5)}${site.hook.padEnd(13)}${(site.name ?? '').padEnd(18)}${verdict}`,
    );
  }
}
process.exit(0);
