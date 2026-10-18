import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import plugin from './index.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function run(script, ...args) {
  return spawnSync('bun', [`packages/lint-rules/scripts/${script}.mjs`, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}
it('exposes actionable structured guidance and rejects unknown rules', () => {
  const result = run('explain', '--json');
  assert.equal(result.status, 0, result.stderr);
  const guides = JSON.parse(result.stdout);
  assert.equal(guides.length, Object.keys(plugin.rules).length);
  assert.ok(guides.every((guide) => guide.id.startsWith('kroma/') && guide.repair && guide.why));
  assert.equal(run('explain', 'unknown-rule').status, 1);
});
it('scaffolds inactive drafts and rejects overwrites and path traversal', () => {
  const name = `test-draft-${process.pid}`;
  const directory = fileURLToPath(new URL(`../drafts/${name}/`, import.meta.url));
  assert.equal(existsSync(directory), false);
  try {
    const first = run('new-rule', name);
    assert.equal(first.status, 0, first.stderr);
    const initial = readFileSync(`${directory}rule.mjs`, 'utf8');
    assert.match(initial, /TODO/);
    assert.equal(run('new-rule', name).status, 1);
    assert.equal(readFileSync(`${directory}rule.mjs`, 'utf8'), initial);
    assert.equal(run('new-rule', '../escape').status, 1);
    assert.equal(run('explain', name).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
