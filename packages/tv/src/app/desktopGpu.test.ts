import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGpuRendering, gpuToggleAvailable, setGpuRendering } from './desktopGpu';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const shell = (invoke: Invoke) => ({ core: { invoke }, event: { listen: async () => () => {} } });

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) Tauri';

function desktop(invoke: Invoke = async () => undefined) {
  vi.stubGlobal('__TAURI__', shell(invoke));
  vi.stubGlobal('navigator', { userAgent: LINUX });
}

afterEach(() => vi.unstubAllGlobals());

describe('gpuToggleAvailable', () => {
  it('is offered on the Linux desktop shell, the only one with the knob', () => {
    desktop();
    expect(gpuToggleAvailable()).toBe(true);
  });

  it('is hidden in a browser shell, Tauri or not', () => {
    vi.stubGlobal('navigator', { userAgent: LINUX });
    expect(gpuToggleAvailable()).toBe(false);
  });

  it('is hidden on a Tauri Android shell, which is Linux without WebKitGTK', () => {
    vi.stubGlobal(
      '__TAURI__',
      shell(async () => undefined),
    );
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 12) Tauri' });
    expect(gpuToggleAvailable()).toBe(false);
  });

  it('is hidden on a Tauri macOS shell', () => {
    vi.stubGlobal(
      '__TAURI__',
      shell(async () => undefined),
    );
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Tauri' });
    expect(gpuToggleAvailable()).toBe(false);
  });

  it('is hidden where there is no navigator to read', () => {
    vi.stubGlobal(
      '__TAURI__',
      shell(async () => undefined),
    );
    vi.stubGlobal('navigator', undefined);
    expect(gpuToggleAvailable()).toBe(false);
  });
});

describe('getGpuRendering', () => {
  it('reports what the shell has stored', async () => {
    desktop(async (command) => command === 'webview_gpu_get');
    await expect(getGpuRendering()).resolves.toBe(true);
  });

  it('reads as off when the shell refuses the command', async () => {
    desktop(async () => {
      throw new Error('unknown command');
    });
    await expect(getGpuRendering()).resolves.toBe(false);
  });

  it('reads as off with no shell to ask', async () => {
    await expect(getGpuRendering()).resolves.toBe(false);
  });
});

describe('setGpuRendering', () => {
  it('writes the setting, then relaunches so the new renderer is picked', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    desktop(async (command, args) => {
      calls.push([command, args]);
    });
    await setGpuRendering(true);
    expect(calls).toEqual([
      ['webview_gpu_set', { enabled: true }],
      ['app_relaunch', undefined],
    ]);
  });

  it('does not relaunch when the setting could not be written', async () => {
    const calls: string[] = [];
    desktop(async (command) => {
      calls.push(command);
      throw new Error('refused');
    });
    await expect(setGpuRendering(false)).resolves.toBeUndefined();
    expect(calls).toEqual(['webview_gpu_set']);
  });

  it('is a no-op outside the desktop shell', async () => {
    await expect(setGpuRendering(true)).resolves.toBeUndefined();
  });
});
