import { readFileSync, writeFileSync } from 'node:fs';
import { mergeLcov } from './lcov';

/** `ci lcov merge <out> <report...>`: one report from the parts the jobs measured. */
export function main(argv: string[]): void {
  const [verb, out, ...reports] = argv;
  if (verb !== 'merge' || out === undefined || reports.length === 0) {
    throw new Error('usage: bun run ci lcov merge <out> <report...>');
  }
  const merged = mergeLcov(reports.map((at) => readFileSync(at, 'utf8')));
  writeFileSync(out, merged);
  console.log(`${reports.length} report(s), ${merged.match(/^SF:/gm)?.length ?? 0} files measured`);
}
