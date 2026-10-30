import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../../../.github/scripts/macos-staple.sh', import.meta.url));

function run(script: string, ...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'macos-staple-'));
  const summaryFile = join(dir, 'summary.md');
  writeFileSync(summaryFile, '');
  try {
    const result = spawnSync(
      'bash',
      ['-c', `set -euo pipefail\nsource "$1"\n${script}`, 'test', helper, ...args],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
      },
    );
    return { ...result, summary: readFileSync(summaryFile, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function staple(failures: number, status = 68, validationStatus = 0, validationFailures = 8) {
  return run(`calls=0
validations=0
# Keep the fake command's counters in this shell, like the real helper.
xcrun() {
  printf '%s|%s|%s\n' "$1" "$2" "$3"
  if [[ "$2" = validate ]]; then
    validations=$((validations + 1))
    if (( validations <= ${validationFailures} )); then return ${validationStatus}; fi
    return 0
  fi
  calls=$((calls + 1))
  if (( calls <= ${failures} )); then return ${status}; fi
  return 0
}
sleep() { echo "wait:$1"; }
staple_and_validate 'a path/KROMA.app'
echo complete`);
}

describe('macOS ticket stapling', () => {
  it('validates a successful staple without waiting', () => {
    const result = staple(0);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('stapler|validate|a path/KROMA.app');
    expect(result.stdout).not.toContain('wait:');
    expect(result.stderr).not.toContain('::warning::');
    expect(result.summary).toBe('');
  });

  it('recovers from ticket service failures', () => {
    const result = staple(2);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wait:15');
    expect(result.stdout).toContain('wait:30');
    expect(result.stdout).toContain('complete');
  });

  it('keeps an attached ticket while validation retries', () => {
    const result = staple(0, 68, 68, 1);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/stapler\|staple\|/g)).toHaveLength(1);
    expect(result.stdout.match(/stapler\|validate\|/g)).toHaveLength(2);
    expect(result.stdout).toContain('wait:15');
  });

  it('backs off across an outage of about ten minutes', () => {
    const result = staple(8);

    const waits = [...result.stdout.matchAll(/wait:(\d+)/g)].map((match) => Number(match[1]));
    expect(waits).toEqual([15, 30, 60, 120, 120, 120, 120]);
    expect(result.stdout.match(/stapler\|staple\|/g)).toHaveLength(8);
  });

  it('ships a notarized build unstapled once the outage outlasts the retries', () => {
    const result = staple(8);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('validate');
    expect(result.stdout).toContain('complete');
    expect(result.stderr).toContain('::warning::a path/KROMA.app is notarized but UNSTAPLED');
    expect(result.summary).toContain('- a path/KROMA.app is notarized but UNSTAPLED');
  });

  it('warns when the attached ticket can never be confirmed', () => {
    const result = staple(0, 68, 68, 8);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/stapler\|staple\|/g)).toHaveLength(1);
    expect(result.stdout).toContain('complete');
    expect(result.stderr).toContain('::warning::a path/KROMA.app has its ticket');
    expect(result.summary).toContain('- a path/KROMA.app has its ticket');
  });

  it.each([64, 65, 66, 73, 77])('does not retry permanent exit %s', (status) => {
    const result = staple(1, status);

    expect(result.status).toBe(status);
    expect(result.stdout).not.toContain('wait:');
    expect(result.stderr).toContain('::error::');
  });

  it('fails when ticket validation fails', () => {
    const result = staple(0, 68, 65);

    expect(result.status).toBe(65);
    expect(result.stdout).not.toContain('complete');
  });
});

describe('macOS notarization verdict', () => {
  it('passes an accepted submission', () => {
    const result = run(
      `require_accepted app.zip "$2"\necho complete`,
      '{"message":"Processing complete","id":"abc","status":"Accepted"}',
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('complete');
  });

  it.each(['{"id":"abc","status":"Invalid"}', '{"id":"abc","status":"In Progress"}', ''])(
    'refuses the result %j',
    (verdict) => {
      const result = run(`require_accepted app.zip "$2"\necho complete`, verdict);

      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('complete');
      expect(result.stderr).toContain('::error::Notarization of app.zip was not accepted');
    },
  );
});
