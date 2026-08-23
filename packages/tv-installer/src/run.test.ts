import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, runOk } from './run';
import { nodeSpawn } from './run.fixture';

beforeEach(() => vi.stubGlobal('Bun', { spawn: nodeSpawn }));

afterEach(() => vi.unstubAllGlobals());

describe('run', () => {
  it('answers what the command printed and the code it exited with', async () => {
    expect(await run(['/bin/echo', 'hello'])).toEqual({ code: 0, output: 'hello' });
  });

  it('hands the log every line as the command prints it', async () => {
    const printed: string[] = [];

    await run(['/bin/sh', '-c', 'echo one; echo two'], { log: (line) => printed.push(line) });

    expect(printed).toEqual(['one', 'two']);
  });

  it('collects what the command said on stderr as well as on stdout', async () => {
    const { output } = await run(['/bin/sh', '-c', 'echo out; echo err 1>&2']);

    expect(output.split('\n').sort()).toEqual(['err', 'out']);
  });

  it('keeps a last line the command never ended with a newline', async () => {
    const { output } = await run(['/bin/sh', '-c', "printf 'one\\ntwo'"]);

    expect(output).toBe('one\ntwo');
  });

  it('drops the carriage return and the whitespace a tool trails its lines with', async () => {
    const { output } = await run(['/bin/sh', '-c', "printf 'one \\r\\ntwo\\n   '"]);

    expect(output).toBe('one\ntwo');
  });

  it('answers the code a failing command exited with', async () => {
    const { code } = await run(['/bin/sh', '-c', 'exit 3']);

    expect(code).toBe(3);
  });

  it('runs the command in the directory it was given', async () => {
    const { output } = await run(['/bin/pwd'], { cwd: '/usr' });

    expect(output).toBe('/usr');
  });

  it('refuses a command with nothing to run', async () => {
    await expect(run([])).rejects.toThrow('run() needs a command');
  });

  it('kills a command that outstays its timeout', async () => {
    const started = performance.now();

    const { code, output } = await run(['/bin/sleep', '5'], { timeoutMs: 100 });

    expect(output).toBe('');
    expect(code).toBe(137);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('runOk', () => {
  it('answers what a command that succeeded printed', async () => {
    expect(await runOk(['/bin/echo', 'ready'])).toBe('ready');
  });

  it('throws with the last four lines a failing command printed', async () => {
    const noisy = ['/bin/sh', '-c', 'for i in 1 2 3 4 5 6; do echo line$i; done; exit 2'];

    await expect(runOk(noisy)).rejects.toThrow('/bin/sh exited 2: line3 / line4 / line5 / line6');
  });

  it('throws naming only the code when the command said nothing at all', async () => {
    await expect(runOk(['/bin/sh', '-c', 'exit 4'])).rejects.toThrow(/exited 4$/);
  });
});
