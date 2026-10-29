import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../../../.github/scripts/macos-staple.sh', import.meta.url));

function staple(failures: number, status = 68, validationStatus = 0, validationFailures = 5) {
  return spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
source "$1"
calls=0
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
echo complete`,
      'test',
      helper,
    ],
    { encoding: 'utf8' },
  );
}

describe('macOS ticket stapling', () => {
  it('validates a successful staple without waiting', () => {
    const result = staple(0);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('stapler|validate|a path/KROMA.app');
    expect(result.stdout).not.toContain('wait:');
  });

  it('recovers from ticket service failures', () => {
    const result = staple(2);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wait:10');
    expect(result.stdout).toContain('wait:20');
    expect(result.stdout).toContain('complete');
  });

  it('fails after five attempts', () => {
    const result = staple(5);
    expect(result.status).toBe(68);
    expect(result.stdout.match(/stapler\|staple\|/g)).toHaveLength(5);
    expect(result.stdout).not.toContain('validate');
    expect(result.stdout).not.toContain('complete');
  });

  it.each([64, 65, 66, 73, 77])('does not retry permanent exit %s', (status) => {
    const result = staple(1, status);
    expect(result.status).toBe(status);
    expect(result.stdout).not.toContain('wait:');
  });

  it('retries a ticket-service failure during validation', () => {
    const result = staple(0, 68, 68, 1);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wait:10');
    expect(result.stdout.match(/stapler\|validate\|/g)).toHaveLength(2);
  });

  it('fails when ticket validation fails', () => {
    const result = staple(0, 68, 65);
    expect(result.status).toBe(65);
    expect(result.stdout).not.toContain('complete');
  });
});
