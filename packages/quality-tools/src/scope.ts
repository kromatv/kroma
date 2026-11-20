import { parseArgs } from 'node:util';

export interface Scope {
  paths: string[];
  lcov: string[];
}

/** What a report covers: the paths to narrow the source list to, and any lcov report beyond the two default ones. */
export function parseScope(argv: string[]): Scope {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { lcov: { type: 'string', multiple: true } },
  });
  return { paths: positionals, lcov: values.lcov ?? [] };
}

export interface GateScope {
  base: string;
  lcov: string[];
}

/** What the merge gate measures against: `--base <ref>`, `origin/main` without one, and any extra lcov report. */
export function parseGateScope(argv: string[]): GateScope {
  const { values } = parseArgs({
    args: argv,
    options: { base: { type: 'string' }, lcov: { type: 'string', multiple: true } },
  });
  return { base: values.base ?? 'origin/main', lcov: values.lcov ?? [] };
}
