import { describe, expect, it } from 'vitest';
import { DeviceId } from '../../core/ids';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';

const receiver = DeviceId.parse('tv-salon-01');

describe('the cast endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'announce',
      call: (c) =>
        c.cast.announce({
          receiverId: receiver,
          name: 'Salon',
          platform: 'tizen',
          lastAppliedSeq: 3,
        }),
      method: 'POST',
      path: '/cast/announce',
      body: { receiverId: 'tv-salon-01', name: 'Salon', platform: 'tizen', lastAppliedSeq: 3 },
    },
    {
      name: 'unregister',
      call: (c) => c.cast.unregister(receiver),
      method: 'DELETE',
      path: '/cast/receivers/tv-salon-01',
    },
    { name: 'receivers', call: (c) => c.cast.receivers(), method: 'GET', path: '/cast/receivers' },
    {
      name: 'command',
      call: (c) => c.cast.command(receiver, { type: 'pause' }),
      method: 'POST',
      path: '/cast/receivers/tv-salon-01/command',
      body: { type: 'pause' },
    },
  ])('$name', checkEndpoint);
});

describe('sending a command', () => {
  it('resolves with the sequence number the receiver will apply it under', async () => {
    const { client } = recordingClient(() => ({ json: { seq: 7 } }));

    await expect(client.cast.command(receiver, { type: 'resume' })).resolves.toBe(7);
  });
});
