#!/usr/bin/env bun
// Perf faults a rendered tree cannot show, across every workspace that ships
// source: the worklist, worst file first.
//
//   bun run perf:scan                  every workspace
//   bun run perf:scan virtual-rail     only files whose path contains the needle
//   bun run perf:scan --rule identity-memo
//
// See packages/ui/audit/perf-scan.ts for what each rule means, and
// ./audit-target.ts for the only part of this that knows the repo.

import { type Rule, scanTrees, WHY } from '../audit/perf-scan';
import { compiler, ROOT, shippedTargets, shippedTrees } from './audit-target';

const args = process.argv.slice(2);
const at = args.indexOf('--rule');
const only = at === -1 ? null : (args[at + 1] as Rule | undefined);
const needle = args.find((a) => !a.startsWith('--') && a !== only) ?? '';

const trees = shippedTrees();
const all = await scanTrees(compiler(), ROOT, shippedTargets());
const found = all.filter((f) => (!needle || f.file.includes(needle)) && (!only || f.rule === only));

const byRule = new Map<Rule, number>();
for (const f of found) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);

const byFile = new Map<string, typeof found>();
for (const f of found) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

console.log(`\n  ${found.length} findings in ${byFile.size} files, over ${trees.length} trees\n`);
for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${rule}`);
  console.log(`       ${WHY[rule]}\n`);
}
for (const [file, list] of [...byFile].sort(([, a], [, b]) => b.length - a.length)) {
  console.log(`  ${String(list.length).padStart(3)}  ${file}`);
  for (const f of [...list].sort((a, b) => a.line - b.line)) {
    console.log(`         :${f.line}  ${f.rule}  ${f.note}`);
  }
}
console.log('');
process.exit(0);
