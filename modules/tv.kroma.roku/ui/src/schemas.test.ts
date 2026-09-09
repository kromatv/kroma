import { describe, expect, it } from 'vitest';
import { InstallStatus, RokuDevice, RokuView } from './schemas';

const device = {
  serial: 'P0A070000007',
  name: 'Salon',
  model: 'Roku Ultra',
  ip: '192.168.1.134',
  softwareVersion: '13.1.4',
  developerEnabled: true,
  lastSeen: '2026-09-07T16:51:19Z',
  install: { status: 'installed', message: null, at: '2026-09-07T16:52:00Z' },
};

describe('RokuView', () => {
  it('parses the sidecar view a box has never been installed on', () => {
    const view = RokuView.parse({
      serverUrl: 'http://192.168.1.20:4040',
      hasPassword: false,
      devices: [{ ...device, install: { status: 'none', message: null, at: null } }],
    });

    expect(view.hasPassword).toBe(false);
    expect(view.devices[0]?.install.status).toBe('none');
    expect(view.devices[0]?.serial).toBe('P0A070000007');
  });

  it('accepts a server with no LAN address to hand a box', () => {
    const view = RokuView.parse({ serverUrl: null, hasPassword: true, devices: [] });

    expect(view.serverUrl).toBeNull();
    expect(view.devices).toEqual([]);
  });

  it('carries the installer refusal the box answered with', () => {
    const view = RokuView.parse({
      hasPassword: true,
      devices: [
        { ...device, install: { status: 'failed', message: 'Install Failure: Invalid archive' } },
      ],
    });

    expect(view.devices[0]?.install.message).toBe('Install Failure: Invalid archive');
  });
});

describe('RokuDevice', () => {
  it('reads a box whose developer installer is closed', () => {
    const parsed = RokuDevice.parse({ ...device, developerEnabled: false });

    expect(parsed.developerEnabled).toBe(false);
    expect(parsed.model).toBe('Roku Ultra');
  });

  it('refuses a box the sidecar could not name', () => {
    expect(() => RokuDevice.parse({ ...device, serial: 42 })).toThrow();
  });
});

describe('InstallStatus', () => {
  it('reads every state the sidecar reports', () => {
    for (const status of ['none', 'installing', 'installed', 'failed']) {
      expect(InstallStatus.parse(status)).toBe(status);
    }
  });

  it('falls back rather than breaking the page on a state it has not met', () => {
    expect(InstallStatus.parse('rebooting')).toBe('none');
  });
});
