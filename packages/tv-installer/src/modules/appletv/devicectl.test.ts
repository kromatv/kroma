import { beforeEach, describe, expect, it, vi } from 'vitest';
import { devicectl, devicectlAdvice, failureText } from './devicectl';

const { run, requireAppleTvTool, unlink, wrote } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  requireAppleTvTool: vi.fn(() => '/usr/bin/devicectl'),
  unlink: vi.fn(async (_path: string) => {}),
  wrote: { text: '', exists: true, size: 0 },
}));
vi.mock('../../run', () => ({ run }));
vi.mock('./toolchain', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requireAppleTvTool,
}));
vi.mock('node:fs/promises', () => ({ unlink }));
vi.stubGlobal('Bun', {
  file: () => ({
    exists: async () => wrote.exists,
    size: wrote.size,
    text: async () => wrote.text,
  }),
});

const report = (description: string) => ({
  error: {
    code: 1000,
    domain: 'com.apple.dt.CoreDeviceError',
    userInfo: {
      DeviceName: { string: 'Salon' },
      NSLocalizedDescription: { string: description },
    },
  },
  info: { commandType: 'devicectl.device.install.app', jsonVersion: 3, outcome: 'failed' },
});

describe('failureText', () => {
  it('reads the sentence devicectl wrote into its report', () => {
    const written = report('The specified device was not found. (Name: Salon)');

    expect(failureText(written)).toBe('The specified device was not found. (Name: Salon)');
  });

  it('answers nothing for the report of a command that worked', () => {
    const written = { info: { jsonVersion: 3, outcome: 'success' }, result: {} };

    expect(failureText(written)).toBeNull();
  });

  it('answers nothing when devicectl wrote no report at all', () => {
    expect(failureText(null)).toBeNull();
  });
});

describe('devicectlAdvice', () => {
  it('sends the owner back to Xcode when CoreDevice has forgotten the set', () => {
    const said = 'The specified device was not found. (Name: Salon)';

    expect(devicectlAdvice(said)).toContain('pair it again');
  });

  it('tells the owner to wake a set that stopped answering mid-install', () => {
    const said = 'There was a problem communicating with the device.';

    expect(devicectlAdvice(said)).toContain('wake it');
  });

  it('names the setting to change when the set refuses developer commands', () => {
    const said = 'The operation failed since Developer Mode is disabled on the device.';

    expect(devicectlAdvice(said)).toContain('Developer Mode');
  });

  it('blames the signing profile when the set will not verify the bundle', () => {
    const said = 'Failed to install the app on the device. ApplicationVerificationFailed';

    expect(devicectlAdvice(said)).toContain('signing profile');
  });

  it('says which SDK to build against when a simulator bundle is pushed at a real set', () => {
    const said = 'The bundle at the provided URL was built for AppleTVSimulator.';

    expect(devicectlAdvice(said)).toContain('appletvos');
  });

  it('sends the owner to a newer Xcode when the disk image will not mount', () => {
    const said = 'The developer disk image could not be mounted on this device.';

    expect(devicectlAdvice(said)).toContain('update Xcode');
  });

  it('quotes devicectl when the failure is one it has no advice for', () => {
    const said = 'The operation failed since the device is out of storage.';

    expect(devicectlAdvice(said)).toBe(
      'devicectl failed: The operation failed since the device is out of storage.',
    );
  });
});

describe('devicectl', () => {
  beforeEach(() => {
    run.mockReset();
    unlink.mockReset();
    run.mockResolvedValue({ code: 0, output: '' });
    wrote.exists = true;
    wrote.text = JSON.stringify(report('The specified device was not found.'));
    wrote.size = wrote.text.length;
  });

  it('tells devicectl where to write the report, and hands back what it wrote', async () => {
    const outcome = await devicectl(['list', 'devices']);

    const [binary, list, devices, flag, path] = run.mock.calls[0]?.[0] ?? [];
    expect([binary, list, devices, flag]).toEqual([
      '/usr/bin/devicectl',
      'list',
      'devices',
      '--json-output',
    ]);
    expect(path).toMatch(/kroma-devicectl-[0-9a-f-]+\.json$/);
    expect(failureText(outcome.report)).toBe('The specified device was not found.');
  });

  it('deletes the report it asked for, whatever devicectl did', async () => {
    run.mockResolvedValue({ code: 1, output: 'failed' });

    await devicectl(['list', 'devices']);

    expect(unlink).toHaveBeenCalledOnce();
  });

  it('answers no report when devicectl wrote none', async () => {
    wrote.exists = false;

    expect((await devicectl(['list', 'devices'])).report).toBeNull();
  });

  it('answers no report when what devicectl wrote is not JSON', async () => {
    wrote.text = 'not json at all';
    wrote.size = wrote.text.length;

    expect((await devicectl(['list', 'devices'])).report).toBeNull();
  });

  it('refuses a report too big to read into memory', async () => {
    wrote.size = 4_000_001;

    await expect(devicectl(['list', 'devices'])).rejects.toThrow(
      'devicectl wrote a 4000001 byte report, past the 4000000 read',
    );
  });
});
