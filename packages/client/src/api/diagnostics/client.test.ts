import { describe, expect, it } from 'vitest';
import { DeviceId } from '../../core/ids';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';

const CRASH = {
  message: 'boom',
  stack: 'at <anonymous>',
  platform: 'web',
  capturedAt: 1,
  build: { version: '1.0.0', commit: null },
  device: null,
};

describe('the diagnostics endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'crash',
      call: (c) => c.diagnostics.crash(CRASH),
      method: 'POST',
      path: '/diagnostics/crash',
      body: CRASH,
    },
    {
      name: 'screens',
      call: (c) => c.diagnostics.screens(),
      method: 'GET',
      path: '/admin/diagnostics/screens',
    },
    {
      name: 'readScreen',
      call: (c) => c.diagnostics.readScreen(DeviceId.parse('tv-salon-01')),
      method: 'POST',
      path: '/admin/diagnostics/screens/tv-salon-01',
    },
  ])('$name', checkEndpoint);
});

describe('reading a screen', () => {
  it('lists the screens out of the roster body', async () => {
    const device = { id: 'tv-salon-01', name: 'Salon', platform: 'Tizen' };
    const { client } = recordingClient(() => ({ json: { screens: [device] } }));

    await expect(client.diagnostics.screens()).resolves.toEqual([device]);
  });

  it('resolves with the rows the screen answered', async () => {
    const screen = {
      fibers: 3,
      truncated: false,
      rows: [{ depth: 0, name: 'Text', props: { children: 'Pied' }, box: null }],
    };
    const { client } = recordingClient(() => ({ json: screen }));

    await expect(client.diagnostics.readScreen(DeviceId.parse('tv-salon-01'))).resolves.toEqual(
      screen,
    );
  });
});
