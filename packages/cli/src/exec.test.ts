import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { type ExecOptions, exec } from './exec';

const work = realpathSync(mkdtempSync(join(tmpdir(), 'kroma-exec-')));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

const node = (script: string, options?: Partial<ExecOptions>) =>
  exec(process.execPath, ['-e', script], { cwd: work, quiet: true, ...options });

describe('exec', () => {
  it('resolves with the code the command exited on rather than throwing', async () => {
    const result = await node('process.exit(3)');

    expect(result.exitCode).toBe(3);
  });

  it('treats a command a signal killed as a failure', async () => {
    const result = await node('process.kill(process.pid, "SIGKILL")');

    expect(result.exitCode).toBe(1);
  });

  it('captures both streams when it is told to stay quiet', async () => {
    const result = await node('process.stdout.write("built"); process.stderr.write("warned")');

    expect(result).toEqual({ exitCode: 0, stdout: 'built', stderr: 'warned' });
  });

  it('captures nothing when the terminal is passed through', async () => {
    const result = await node('process.stdout.write("straight to the terminal")', {
      quiet: false,
    });

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('hands the command the environment it was given, and only that', async () => {
    vi.stubEnv('KROMA_EXEC_INHERITED', 'from the parent');

    const result = await node('process.stdout.write(String(process.env.KROMA_EXEC_GIVEN))', {
      env: { KROMA_EXEC_GIVEN: 'from the caller' },
    });
    const inherited = await node('process.stdout.write(String(process.env.KROMA_EXEC_INHERITED))', {
      env: { KROMA_EXEC_GIVEN: 'from the caller' },
    });

    expect(result.stdout).toBe('from the caller');
    expect(inherited.stdout).toBe('undefined');
  });

  it('falls back to its own environment when the caller names none', async () => {
    vi.stubEnv('KROMA_EXEC_INHERITED', 'from the parent');

    const result = await node('process.stdout.write(String(process.env.KROMA_EXEC_INHERITED))');

    expect(result.stdout).toBe('from the parent');
  });

  it('runs the command in the directory it was given', async () => {
    const result = await node('process.stdout.write(process.cwd())');

    expect(result.stdout).toBe(work);
  });

  it('rejects when there is no such command to run', async () => {
    await expect(
      exec(join(work, 'no-such-binary'), [], { cwd: work, quiet: true }),
    ).rejects.toThrow(/ENOENT/);
  });
});
