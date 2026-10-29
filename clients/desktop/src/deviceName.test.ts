import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn<(cmd: string) => Promise<unknown>>());
const found = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@kromatv/tv', () => ({ lateDeviceName: () => ({ get: () => null, found }) }));

import { desktopDeviceName } from './deviceName';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function shellAnswers(answer: unknown) {
  invoke.mockImplementation(async (cmd) => (cmd === 'device_name' ? answer : null));
}

afterEach(() => {
  invoke.mockReset();
  found.mockReset();
});

describe('desktopDeviceName', () => {
  it('hands over the name the shell reads from the computer', async () => {
    shellAnswers('Studio iMac');

    desktopDeviceName();
    await settle();

    expect(found).toHaveBeenCalledWith('Studio iMac');
  });

  it('hands over no name when the computer has none', async () => {
    shellAnswers(null);

    desktopDeviceName();
    await settle();

    expect(found).toHaveBeenCalledWith(null);
  });

  it('hands over no name when the shell answers something other than a name', async () => {
    shellAnswers({ name: 'Studio iMac' });

    desktopDeviceName();
    await settle();

    expect(found).toHaveBeenCalledWith(undefined);
  });

  it('keeps the platform label in a browser with no shell to ask', async () => {
    invoke.mockRejectedValue(new Error('window.__TAURI_INTERNALS__ is undefined'));

    desktopDeviceName();
    await settle();

    expect(found).not.toHaveBeenCalled();
  });
});
