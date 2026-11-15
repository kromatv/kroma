import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compare, overridesOf, report, ruleOf, shrink, sorted, tally } from './debt.mjs';

const script = fileURLToPath(new URL('../scripts/debt.mjs', import.meta.url));

it('names the rule of a diagnostic code and ignores a finding no rule owns', () => {
  assert.equal(ruleOf('eslint(curly)'), 'eslint/curly');
  assert.equal(ruleOf('react-hooks(exhaustive-deps)'), 'react-hooks/exhaustive-deps');
  assert.equal(ruleOf(undefined), null);
  assert.equal(ruleOf('not a code'), null);
});

it('counts each rule once per finding and per file', () => {
  const counts = tally([
    { code: 'eslint(curly)', filename: 'b.ts' },
    { code: 'eslint(curly)', filename: 'b.ts' },
    { code: 'eslint(curly)', filename: 'a.ts' },
    { code: 'kroma(zod-nonempty)', filename: 'a.ts' },
    { code: undefined, filename: 'a.ts' },
    { code: 'eslint(curly)' },
  ]);

  assert.deepEqual(counts, {
    'eslint/curly': { 'b.ts': 2, 'a.ts': 1 },
    'kroma/zod-nonempty': { 'a.ts': 1 },
  });
});

it('separates what got worse, what is new and what was fixed', () => {
  const recorded = { 'eslint/curly': { 'a.ts': 2, 'b.ts': 1, 'c.ts': 1 } };
  const actual = { 'eslint/curly': { 'a.ts': 3, 'b.ts': 1, 'd.ts': 1 } };

  const gaps = compare(recorded, actual);

  assert.deepEqual(gaps.worse, [{ rule: 'eslint/curly', file: 'a.ts', allowed: 2, found: 3 }]);
  assert.deepEqual(gaps.fresh, [{ rule: 'eslint/curly', file: 'd.ts', allowed: 0, found: 1 }]);
  assert.deepEqual(gaps.better, [{ rule: 'eslint/curly', file: 'c.ts', allowed: 1, found: 0 }]);
});

it('lowers an allowance to what the code still holds and never raises one', () => {
  const recorded = { 'eslint/curly': { 'a.ts': 2, 'b.ts': 4 }, 'eslint/no-var': { 'a.ts': 1 } };
  const actual = { 'eslint/curly': { 'a.ts': 5, 'b.ts': 1, 'c.ts': 9 } };

  assert.deepEqual(shrink(recorded, actual), { 'eslint/curly': { 'a.ts': 2, 'b.ts': 1 } });
});

it('orders rules and files so the recorded file is stable', () => {
  const ordered = sorted({ b: { 'z.ts': 1, 'a.ts': 2 }, a: { 'm.ts': 3 } });

  assert.equal(JSON.stringify(ordered), '{"a":{"m.ts":3},"b":{"a.ts":2,"z.ts":1}}');
});

it('switches a rule off in the files that owe it, with glob signs escaped', () => {
  const overrides = overridesOf({
    'eslint/curly': { 'src/(app)/[id].tsx': 1, 'src/$slug.ts': 1 },
  });

  assert.deepEqual(overrides, [
    {
      files: [String.raw`src/$slug.ts`, String.raw`src/\(app\)/\[id\].tsx`],
      rules: { 'eslint/curly': 'off' },
    },
  ]);
});

it('says nothing when the code and the list agree', () => {
  assert.equal(report({ worse: [], fresh: [], better: [] }), '');
});

function project(source) {
  const root = mkdtempSync(join(tmpdir(), 'kroma-lint-debt-'));
  mkdirSync(join(root, 'packages/lint-rules/debt'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '');
  writeFileSync(join(root, 'packages/lint-rules/debt/oxlintrc.json'), '{ "overrides": [] }');
  writeFileSync(
    join(root, '.oxlintrc.json'),
    JSON.stringify({
      extends: ['./packages/lint-rules/debt/oxlintrc.json'],
      categories: { correctness: 'off' },
      rules: { 'no-var': 'error' },
    }),
  );
  writeFileSync(join(root, 'legacy.js'), source);
  return root;
}

function debt(root, mode) {
  const args = mode ? [script, mode] : [script];
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, KROMA_LINT_ROOT: root },
  });
}

function recorded(root) {
  return JSON.parse(readFileSync(join(root, 'packages/lint-rules/debt/counts.json'), 'utf8'));
}

it('records a baseline, then fails on new debt and on debt left unrecorded', () => {
  const root = project('var a = 1;\nvar b = 2;\n');
  try {
    const fresh = debt(root);
    assert.equal(fresh.status, 1, fresh.stderr);
    assert.match(fresh.stderr, /New findings/);

    assert.equal(debt(root, '--baseline').status, 0);
    assert.deepEqual(recorded(root), { 'eslint/no-var': { 'legacy.js': 2 } });
    assert.equal(debt(root).status, 0);

    writeFileSync(join(root, 'legacy.js'), 'var a = 1;\nvar b = 2;\nvar c = 3;\n');
    const worse = debt(root);
    assert.equal(worse.status, 1);
    assert.match(worse.stderr, /legacy\.js: eslint\/no-var 2 -> 3/);

    writeFileSync(join(root, 'legacy.js'), 'var a = 1;\n');
    const better = debt(root);
    assert.equal(better.status, 1);
    assert.match(better.stderr, /lint:debt --update/);

    assert.equal(debt(root, '--update').status, 0);
    assert.deepEqual(recorded(root), { 'eslint/no-var': { 'legacy.js': 1 } });

    writeFileSync(join(root, 'legacy.js'), 'const a = 1;\n');
    assert.equal(debt(root, '--update').status, 0);
    assert.deepEqual(recorded(root), {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
