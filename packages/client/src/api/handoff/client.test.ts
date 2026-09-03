import { describe, it } from 'vitest';
import { DeviceId } from '../../core/ids';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { HandoffHandle } from './ids';

const device = DeviceId.parse('tv-salon-01');
const handle = HandoffHandle.parse('h 1');

describe('the handoff endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'announce',
      call: (c) => c.handoff.announce({ deviceId: device, name: 'Salon', platform: 'tizen' }),
      method: 'POST',
      path: '/handoff/announce',
      auth: 'public',
      body: { deviceId: 'tv-salon-01', name: 'Salon', platform: 'tizen' },
    },
    {
      name: 'leave',
      call: (c) => c.handoff.leave('sec'),
      method: 'POST',
      path: '/handoff/leave',
      auth: 'public',
      body: { secret: 'sec' },
    },
    {
      name: 'poll, which carries its secret in the body rather than a logged URL',
      call: (c) => c.handoff.poll('sec'),
      method: 'POST',
      path: '/handoff/poll',
      auth: 'public',
      body: { secret: 'sec' },
    },
    { name: 'devices', call: (c) => c.handoff.devices(), method: 'GET', path: '/handoff/devices' },
    {
      name: 'grant with the check the person read off the screen',
      call: (c) => c.handoff.grant(handle, { check: 'AB12' }),
      method: 'POST',
      path: '/handoff/grant',
      body: { handle: 'h 1', check: 'AB12' },
    },
    {
      name: 'grant with no evidence at all',
      call: (c) => c.handoff.grant(handle),
      method: 'POST',
      path: '/handoff/grant',
      body: { handle: 'h 1' },
    },
  ])('$name', checkEndpoint);
});
