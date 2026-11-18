import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { mergeLcov } from './lcov';

const REPORT = 'lcov.info';

/** The reports one argument stands for: the file itself, or every `lcov.info`
 * below a folder, at any depth. A job that measured one part leaves its report
 * at the top of the folder, and one that measured several leaves a folder per
 * part. */
export function reportsAt(at: string): string[] {
  if (!statSync(at).isDirectory()) {
    return [at];
  }
  return readdirSync(at, { recursive: true, encoding: 'utf8' })
    .filter((name) => basename(name) === REPORT)
    .map((name) => join(at, name))
    .sort();
}

/** `ci lcov merge <out> <report or folder...>`: one report from the parts the
 * jobs measured. */
export function main(argv: string[]): void {
  const [verb, out, ...places] = argv;
  const reports = places.flatMap(reportsAt);
  if (verb !== 'merge' || out === undefined || reports.length === 0) {
    throw new Error('usage: bun run ci lcov merge <out> <report or folder...>');
  }
  const merged = mergeLcov(reports.map((at) => readFileSync(at, 'utf8')));
  writeFileSync(out, merged);
  console.log(`${reports.length} report(s), ${merged.match(/^SF:/gm)?.length ?? 0} files measured`);
}
