// A fast, offline stand-in for the SonarCloud rules this repo keeps tripping.
//
// The real analysis runs in CI and takes ~10 minutes, which is far too slow to
// iterate against. Most of what it catches here is not deep dataflow - it is a
// handful of mechanical patterns that a grep can find in under a second. This
// covers those, so a Sonar regression is caught before the push rather than
// after it.
//
// It is NOT a replacement for the CI scan, and deliberately covers only rules it
// can decide from one line with no false positives. Cognitive complexity (S3776)
// and nested ternaries (S3358) are both left out: the first needs a real metric
// and the second reads identically to a ternary inside an object literal, so a
// regex version cried wolf on code Sonar accepts. Anything this misses, CI still
// gates. Run: `bun run sonar:precheck`.

import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

interface Rule {
  /** The SonarCloud rule key, so a hit can be looked up. */
  id: string;
  what: string;
  /** Matched per line. */
  test: RegExp;
  /** Skip a line that legitimately matches (a comment explaining the rule). */
  unless?: RegExp;
}

const RULES: Rule[] = [
  {
    // Only a LITERAL pattern: `replace(/\+/g, '-')` is a `replaceAll('+', '-')`,
    // while `replace(/[^\x20-\x7E]/g, '')` has no string form and Sonar leaves
    // it alone. Calibrated against `packages/client/src/identity.ts`, which the
    // real analysis accepts.
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

/** Sonar analyses tests under a different profile and does not raise these rules
 * there - verified against `worker/grant.test.ts`, which trips two of them and
 * is reported clean. Matching that keeps this tool worth listening to. */
const IS_TEST = /\.(test|spec)\.[cm]?tsx?$/;

/** This file necessarily contains every pattern it hunts for - in the `test`
 * regexes and in the prose describing them - so it cannot scan itself. */
const SELF = 'scripts/sonar-precheck.ts';

/** The files to scan, one per line on stdin.
 *
 * Read rather than derived, so this spawns nothing: a script that shelled out to
 * `git` was itself two Sonar findings (an unpinned PATH lookup and a
 * CLI-argument escape), which is a poor advertisement for a tool whose whole job
 * is keeping the count at zero. The npm script pipes `git diff` in.
 *
 * The caller passes CHANGED files because Sonar gates a PR on its new code:
 * scanning the whole tree reports things the analysis deliberately ignores, and
 * every pattern still standing on `main` is one it has already accepted. */
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
