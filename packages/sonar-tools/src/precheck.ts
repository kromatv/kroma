// A fast, offline stand-in for the SonarCloud rules this repo keeps tripping.
// The real analysis runs in CI and takes ~10 minutes; this covers the
// mechanical, single-line patterns a regex can decide with no false
// positives, so a regression is caught before the push. NOT a replacement for
// the CI scan: cognitive complexity (S3776) and nested ternaries (S3358) are
// left out, since neither can be decided from one line without false
// positives. Run: `bun run sonar:precheck`.

import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

interface Rule {
  id: string;
  what: string;
  test: RegExp;
  unless?: RegExp;
}

const RULES: Rule[] = [
  {
    // Only a LITERAL pattern: `replace(/[^\x20-\x7E]/g, '')` has no string
    // form and Sonar leaves it alone.
    id: 'typescript:S7781',
    what: 'prefer String#replaceAll() over a global String#replace() with a literal pattern',
    test: /\.replace\(\/(?:[^\\/[\]().*+?{}|^$\n]|\\[^sSdDwWbBnrtu\n])+\/g\s*,/,
  },
  {
    id: 'typescript:S7758',
    what: 'prefer String#codePointAt() over String#charCodeAt()',
    test: /\.charCodeAt\(/,
  },
  {
    id: 'typescript:S7758',
    what: 'prefer String.fromCodePoint() over String.fromCharCode()',
    test: /String\.fromCharCode\(/,
  },
  {
    id: 'typescript:S8786',
    what: 'super-linear regex: an unanchored trailing-run strip backtracks at every position',
    test: /\/=\+\$\//,
  },
];

const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);

// Sonar analyses tests under a different profile and does not raise these
// rules there.
const IS_TEST = /\.(test|spec)\.[cm]?tsx?$/;

// This file necessarily contains every pattern it hunts for, so it cannot
// scan itself.
const SELF = 'packages/sonar-tools/src/precheck.ts';

// Read from stdin rather than derived, so this spawns nothing: shelling out
// to `git` was itself two Sonar findings. The caller passes CHANGED files
// because Sonar gates a PR on its new code; every pattern still standing on
// `main` is one it has already accepted.
function filesFromStdin(): string[] {
  const out = readFileSync(0, 'utf8');
  return out
    .split('\n')
    .filter(
      (f) =>
        f &&
        f !== SELF &&
        EXTS.has(extname(f)) &&
        !f.endsWith('.gen.ts') &&
        !IS_TEST.test(f) &&
        existsSync(f),
    );
}

let hits = 0;
const files = filesFromStdin();
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // A line that is only a comment is describing the rule, not breaking it.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const rule of RULES) {
      if (rule.test.test(line) && !rule.unless?.test(line)) {
        console.log(`${file}:${i + 1}  ${rule.id}  ${rule.what}`);
        hits++;
      }
    }
  });
}

console.log(
  hits
    ? `\n${hits} likely Sonar issue(s) in ${files.length} changed file(s).`
    : `No known Sonar patterns in ${files.length} changed file(s).`,
);
process.exit(hits ? 1 : 0);
