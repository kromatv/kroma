import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adbDevice } from './adb';

const { run, locate } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  locate: vi.fn((): string | null => '/usr/bin/adb'),
}));
vi.mock('../../run', () => ({ run }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  locate,
}));

const props = [
  '[ro.build.version.release]: [12]',
  '[ro.product.model]: [SHIELD Android TV]',
  '[ro.product.manufacturer]: [NVIDIA]',
].join('\n');

const webview = 'Package [com.google.android.webview]\n    versionName=108.0.5359.128';

const answer = (command: readonly string[]) => {
  if (command.includes('connect')) return { code: 0, output: 'connected to 192.168.1.34:5555' };
  if (command.includes('getprop')) return { code: 0, output: props };
  return { code: 0, output: webview };
};

beforeEach(() => {
  run.mockReset();
  run.mockImplementation(async (command) => answer(command));
  locate.mockReset();
  locate.mockReturnValue('/usr/bin/adb');
});

describe('adbDevice', () => {
  it('reads the model and the maker off the set', async () => {
    const device = await adbDevice('192.168.1.34', 5555);

    expect(device).toMatchObject({ model: 'SHIELD Android TV', vendor: 'NVIDIA' });
  });

  it('names the system WebView as the engine the set renders with', async () => {
    const device = await adbDevice('192.168.1.34', 5555);

    expect(device?.runtime).toEqual({
      name: 'Android',
      version: '12',
      engine: { name: 'WebView', version: '108' },
      learned: 'reported',
    });
  });

  it('still answers when the set would not say which WebView it carries', async () => {
    run.mockImplementation(async (command) =>
      command.includes('dumpsys') ? { code: 1, output: '' } : answer(command),
    );

    const device = await adbDevice('192.168.1.34', 5555);

    expect(device?.runtime?.engine).toBeNull();
  });

  it('answers nothing on a machine with no adb, without running anything', async () => {
    locate.mockReturnValue(null);

    const device = await adbDevice('192.168.1.34', 5555);

    expect(device).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('answers nothing when the set refused the connection', async () => {
    run.mockImplementation(async () => ({ code: 1, output: 'failed to connect to 192.168.1.34' }));

    expect(await adbDevice('192.168.1.34', 5555)).toBeNull();
  });

  it('answers nothing when nobody has accepted the prompt on the screen', async () => {
    run.mockImplementation(async (command) =>
      command.includes('getprop') ? { code: 1, output: 'device unauthorized' } : answer(command),
    );

    expect(await adbDevice('192.168.1.34', 5555)).toBeNull();
  });

  it('answers nothing rather than failing the scan when adb throws', async () => {
    run.mockRejectedValue(new Error('spawn adb ENOENT'));

    expect(await adbDevice('192.168.1.34', 5555)).toBeNull();
  });
});
