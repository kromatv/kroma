import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMain = vi.hoisted(() => vi.fn());

vi.mock('citty', async (importActual) => ({
  ...(await importActual<typeof import('citty')>()),
  runMain,
}));

beforeEach(() => vi.resetModules());

describe('cli', () => {
  it('runs a main command that carries every subcommand', async () => {
    await import('./cli');

    const main = runMain.mock.calls[0]?.[0];
    expect(Object.keys(main.subCommands)).toEqual([
      'create',
      'dev',
      'build',
      'check',
      'install',
      'login',
      'plan',
      'cargo',
      'registry',
      'serve',
      'release',
    ]);
  });
});
