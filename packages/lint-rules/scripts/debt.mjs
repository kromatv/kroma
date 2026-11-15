import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, overridesOf, report, shrink, sorted, tally } from '../src/debt.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const root = process.env.KROMA_LINT_ROOT ?? repo;
const CONFIG = join(root, '.oxlintrc.json');
const STRICT = join(root, '.oxlintrc.strict.tmp.json');
const COUNTS = join(root, 'packages/lint-rules/debt/counts.json');
const OVERRIDES = join(root, 'packages/lint-rules/debt/oxlintrc.json');
const OXLINT = join(repo, 'node_modules/oxlint/bin/oxlint');
const TSGOLINT = join(repo, 'node_modules/.bin/tsgolint');
const MAX_OUTPUT = 512 * 1024 * 1024;

function strictFindings() {
  const strict = JSON.parse(readFileSync(CONFIG, 'utf8'));
  delete strict.extends;
  writeFileSync(STRICT, JSON.stringify(strict));
  try {
    const run = spawnSync(
      process.execPath,
      [OXLINT, '--type-aware', '-c', STRICT, '--ignore-path', '.gitignore', '-f', 'json', '.'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT,
        env: { OXLINT_TSGOLINT_PATH: TSGOLINT, ...process.env },
      },
    );
    if (run.error || ![0, 1].includes(run.status)) {
      throw new Error(`oxlint did not finish: ${run.error?.message ?? run.stderr}`);
    }
    return tally(JSON.parse(run.stdout).diagnostics);
  } finally {
    rmSync(STRICT, { force: true });
  }
}

function recordedDebt() {
  return existsSync(COUNTS) ? JSON.parse(readFileSync(COUNTS, 'utf8')) : {};
}

function record(counts) {
  writeFileSync(COUNTS, `${JSON.stringify(counts, null, 2)}\n`);
  writeFileSync(OVERRIDES, `${JSON.stringify({ overrides: overridesOf(counts) }, null, 2)}\n`);
}

const mode = process.argv[2] ?? '--check';
const actual = strictFindings();
const recorded = mode === '--baseline' ? sorted(actual) : recordedDebt();
if (mode === '--baseline') {
  record(recorded);
}
if (mode === '--update') {
  record(shrink(recorded, actual));
}
const gaps = compare(mode === '--update' ? shrink(recorded, actual) : recorded, actual);
const text = report(gaps);
if (text) {
  console.error(text);
}
process.exit(gaps.worse.length + gaps.fresh.length + gaps.better.length > 0 ? 1 : 0);
