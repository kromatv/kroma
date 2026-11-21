import { describe, expect, it } from 'vitest';
import { DeviceId } from '../../core/ids';
import { ItemId } from '../media';
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
      name: 'forgetWake',
      call: (c) => c.cast.forgetWake(receiver),
      method: 'DELETE',
      path: '/cast/receivers/tv-salon-01/wake',
    },
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

describe('waking a receiver', () => {
  it('sends the play to hold and resolves with the steps to run', async () => {
    const { client, calls } = recordingClient(() => ({
      json: {
        steps: [
          { type: 'magic', mac: 'a0:b1:c2:d3:e4:f5' },
          { type: 'samsung', address: '192.168.1.20', appId: 'KromaTV001.KROMA' },
        ],
      },
    }));

    const reply = await client.cast.wake(receiver, {
      type: 'play',
      itemId: ItemId.parse('film-1'),
    });

    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/cast/receivers/tv-salon-01/wake',
      body: { play: { type: 'play', itemId: 'film-1' } },
    });
    expect(reply.steps.map((step) => step.type)).toEqual(['magic', 'samsung']);
  });

  it('keeps a step a newer server invented as unknown instead of failing the reply', async () => {
    const { client } = recordingClient(() => ({
      json: { steps: [{ type: 'ssap', address: '192.168.1.30' }] },
    }));

    const reply = await client.cast.wake(receiver);

    expect(reply).toEqual({ steps: [{ type: 'unknown' }] });
  });
});
