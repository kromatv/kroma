import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

it('loads all custom rules through the real config and preserves runtime exclusions', () => {
  const scratch = mkdtempSync(join(root, 'packages/ui/src/components/.oxc-probe-'));
  function lint(name, code, format = 'json') {
    const filename = join(scratch, name);
    writeFileSync(filename, code);
    const result = spawnSync(
      process.execPath,
      [
        join(root, 'node_modules/oxlint/bin/oxlint'),
        '--ignore-path',
        '.gitignore',
        '--format',
        format,
        relative(root, filename),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.ok([0, 1].includes(result.status), result.stderr);
    return format === 'json' ? JSON.parse(result.stdout) : result.stdout;
  }
  function houseRules(name, source) {
    return lint(name, source)
      .diagnostics.map(({ code: id }) => id)
      .filter((id) => id.startsWith('kroma('))
      .sort();
  }
  try {
    const code = [
      "import { thing } from '../../../../core/src/index';",
      "import { forwardRef } from 'react';",
      'export let value = 0;',
      '// ---- helpers ----',
    ].join('\n');
    assert.deepEqual(houseRules('invalid.ts', code), [
      'kroma(no-comment-banners)',
      'kroma(no-module-mutable-bindings)',
      'kroma(no-react-forward-ref)',
      'kroma(no-relative-workspace-imports)',
    ]);
    assert.deepEqual(houseRules('owner.test.ts', 'export let fixture = 0;'), []);
    assert.deepEqual(
      houseRules('valid.ts', 'export function create() { let value = 0; return () => ++value; }'),
      [],
    );
    assert.match(lint('agent.ts', code, 'agent'), /bun run --cwd packages\/lint-rules rules/);
    const cases = [
      ['index.ts', 'export const value = 1;', 'index-reexports-only'],
      ['template.ts', `const text = \`hello \${\`user \${name}\`}\`;`, 'no-nested-templates'],
      ['task.ts', '// TODO: remove fallback', 'owned-task-comments'],
      [
        'docs.ts',
        '/** @param value The value. */\nexport function parse(value: string) {}',
        'no-redundant-jsdoc-tags',
      ],
      [
        'record.ts',
        'const value = input as Record<string, unknown>;',
        'no-unknown-record-assertions',
      ],
      ['copy.ts', `const text = "Start ${String.fromCodePoint(0x2014)} end";`, 'no-em-dashes'],
      ['design.ts', "const style = { color: '#fff' };", 'no-raw-design-values'],
      [
        'flag.ts',
        'export function render(compact: boolean) { return compact; }',
        'no-boolean-flag-param',
      ],
      [
        'schema.ts',
        "import { z } from 'zod';\nexport const Name = z.string().min(1);",
        'zod-nonempty',
      ],
    ];
    for (const [name, source, rule] of cases) {
      assert.deepEqual(houseRules(name, source), [`kroma(${rule})`]);
    }
    assert.deepEqual(houseRules('palette.fixture.ts', "const style = { color: '#fff' };"), []);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
