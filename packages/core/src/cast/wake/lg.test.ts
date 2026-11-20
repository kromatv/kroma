import type { CastWakeStep } from '@kromatv/client/cast';
import { describe, expect, it, vi } from 'vitest';
import { runWakeStep } from './steps';
import { reaching, remembering, scripted } from './testing';

const SET: CastWakeStep = {
  type: 'lg',
  address: '192.168.1.40',
  mac: 'a0:b1:c2:d3:e4:f5',
  appId: 'tv.kroma.webos',
};
const REGISTERED = { type: 'registered', id: 'register', payload: { 'client-key': 'k-1' } };
const PROMPTING = { type: 'response', id: 'register', payload: { pairingType: 'PROMPT' } };
const LAUNCHED = { type: 'response', id: 'launch', payload: { returnValue: true } };
const LAUNCH = {
  type: 'request',
  id: 'launch',
  uri: 'ssap://system.launcher/launch',
  payload: { id: 'tv.kroma.webos' },
};

function register(key?: string) {
  return {
    type: 'register',
    id: 'register',
    payload: {
      pairingType: 'PROMPT',
      'client-key': key,
      manifest: { manifestVersion: 1, permissions: ['LAUNCH'] },
    },
  };
}

function answering(frames: unknown[]) {
  const { socket, sent } = scripted(frames);
  return { socket, sent, open: vi.fn(async () => socket) };
}

describe('an LG set that is on', () => {
  it('is paired with on its screen the first time, then asked for the app', async () => {
    const { socket, sent, open } = answering([PROMPTING, REGISTERED, LAUNCHED]);
    const { keys, kept } = remembering();

    const result = await runWakeStep(SET, reaching(null, { open, keys }));

    expect(result).toBe('asked');
    expect(open).toHaveBeenCalledExactlyOnceWith('wss://192.168.1.40:3001');
    expect(sent).toEqual([JSON.parse(JSON.stringify(register())), LAUNCH]);
    expect(socket.next).toHaveBeenCalledWith(60_000);
    expect(kept.get('192.168.1.40')).toBe('k-1');
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('is given back the key it gave before, and answers at once', async () => {
    const { socket, sent, open } = answering([REGISTERED, LAUNCHED]);
    const { keys } = remembering({ '192.168.1.40': 'k-1' });

    await runWakeStep(SET, reaching(null, { open, keys }));

    expect(sent[0]).toEqual(register('k-1'));
    expect(socket.next).toHaveBeenCalledWith(8000);
  });

  it('is reached on its plain port when the encrypted one does not open', async () => {
    const { socket } = scripted([REGISTERED, LAUNCHED]);
    const open = vi.fn(async (url: string) => {
      if (url.startsWith('wss:')) {
        throw new Error('certificate');
      }
      return socket;
    });

    const result = await runWakeStep(SET, reaching(null, { open }));

    expect(result).toBe('asked');
    expect(open).toHaveBeenLastCalledWith('ws://192.168.1.40:3000');
  });

  it('needs a person when nobody accepts the prompt', async () => {
    const { socket, open } = answering([PROMPTING]);

    await expect(runWakeStep(SET, reaching(null, { open }))).resolves.toBe('needsPower');
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('needs a person when it refuses to pair', async () => {
    const { open } = answering([{ type: 'error', id: 'register' }]);

    await expect(runWakeStep(SET, reaching(null, { open }))).resolves.toBe('needsPower');
  });

  it('refuses for good when it does not have the app', async () => {
    const missing = { type: 'error', id: 'launch' };
    const unable = { type: 'response', id: 'launch', payload: { returnValue: false } };

    const first = runWakeStep(SET, reaching(null, { open: answering([REGISTERED, missing]).open }));
    const second = runWakeStep(SET, reaching(null, { open: answering([REGISTERED, unable]).open }));

    await expect(first).resolves.toBe('refused');
    await expect(second).resolves.toBe('refused');
  });

  it('reads past frames that are not its answer', async () => {
    const noise = { type: 'response', id: 'other', payload: { returnValue: false } };
    const { open } = answering(['not json', REGISTERED, noise, LAUNCHED]);

    await expect(runWakeStep(SET, reaching(null, { open }))).resolves.toBe('asked');
  });
});

describe('an LG set that answers nothing', () => {
  it('gets the packet where the platform can send one', async () => {
    const magic = vi.fn(async () => undefined);
    const reach = reaching(null, { magic });

    const result = await runWakeStep(SET, reach);

    expect(result).toBe('asked');
    expect(magic).toHaveBeenCalledExactlyOnceWith('a0:b1:c2:d3:e4:f5');
    expect(reach.open).toHaveBeenCalledTimes(2);
  });

  it('needs a person where no packet can be sent', async () => {
    await expect(runWakeStep(SET, reaching(null))).resolves.toBe('needsPower');
  });
});
