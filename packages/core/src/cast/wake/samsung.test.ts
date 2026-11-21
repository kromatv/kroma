import type { CastWakeStep } from '@kromatv/client/cast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWakeStep } from './steps';
import type { WakeAnswer, WakeReach } from './reach';
import { reaching, remembering, scripted } from './testing';

const SET: CastWakeStep = {
  type: 'samsung',
  address: '192.168.1.20',
  mac: 'a0:b1:c2:d3:e4:f5',
  appId: 'KromaTV002.KROMA',
};
const INFO = 'http://192.168.1.20:8001/api/v2/';
const LAUNCH = 'http://192.168.1.20:8001/api/v2/applications/KromaTV002.KROMA';
const REMOTE = 'wss://192.168.1.20:8002/api/v2/channels/samsung.remote.control?name=S1JPTUE%3D';
const WELCOME = { event: 'ms.channel.connect', data: { token: 12_345 } };
const POWER = {
  method: 'ms.remote.control',
  params: { Cmd: 'Click', DataOfCmd: 'KEY_POWER', Option: 'false', TypeOfRemote: 'SendRemoteKey' },
};

const power = (state: string): WakeAnswer => ({
  status: 200,
  text: JSON.stringify({ device: { PowerState: state } }),
});

async function pass(reach: WakeReach) {
  const result = runWakeStep(SET, reach);
  await vi.runAllTimersAsync();
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a Samsung set that is on', () => {
  it('is asked for the app', async () => {
    const reach = reaching(power('on'));

    const result = await pass(reach);

    expect(result).toBe('asked');
    expect(reach.http).toHaveBeenCalledWith('GET', INFO);
    expect(reach.http).toHaveBeenCalledWith('POST', LAUNCH);
    expect(reach.open).not.toHaveBeenCalled();
  });

  it('refuses for good when it does not know the app it is asked for', async () => {
    const reach = reaching(power('on'));
    reach.http.mockImplementation(async (method) =>
      method === 'GET' ? power('on') : { status: 404, text: '' },
    );

    await expect(pass(reach)).resolves.toBe('refused');
  });

  it('is treated as on when its answer is not the document expected', async () => {
    await expect(pass(reaching({ status: 200, text: '<html>' }))).resolves.toBe('asked');
  });
});

describe('a Samsung set in standby', () => {
  it('is sent the power key once it has greeted the connection, and its token is kept', async () => {
    const { socket, sent } = scripted([{ event: 'ms.channel.ready' }, WELCOME]);
    const { keys, kept } = remembering();
    const reach = reaching(power('standby'), { open: vi.fn(async () => socket), keys });

    const result = await pass(reach);

    expect(result).toBe('asked');
    expect(reach.open).toHaveBeenCalledExactlyOnceWith(REMOTE);
    expect(sent).toEqual([POWER]);
    expect(kept.get('192.168.1.20')).toBe('12345');
    expect(socket.close).toHaveBeenCalledOnce();
    expect(reach.http).not.toHaveBeenCalledWith('POST', LAUNCH);
  });

  it('is given back the token it gave before', async () => {
    const { socket } = scripted([WELCOME]);
    const { keys } = remembering({ '192.168.1.20': 'abc/1' });
    const reach = reaching(power('standby'), { open: vi.fn(async () => socket), keys });

    await pass(reach);

    expect(reach.open).toHaveBeenCalledExactlyOnceWith(`${REMOTE}&token=abc%2F1`);
    expect(socket.next).toHaveBeenCalledWith(8000);
  });

  it('is given a minute to be accepted on its screen the first time', async () => {
    const { socket } = scripted([WELCOME]);
    const reach = reaching(power('standby'), { open: vi.fn(async () => socket) });

    await pass(reach);

    expect(socket.next).toHaveBeenCalledWith(60_000);
  });

  it('needs a person when it refuses the connection', async () => {
    const { socket, sent } = scripted([{ event: 'ms.channel.unauthorized' }]);
    const reach = reaching(power('standby'), { open: vi.fn(async () => socket) });

    await expect(pass(reach)).resolves.toBe('needsPower');
    expect(sent).toEqual([]);
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('needs a person when it never greets the connection', async () => {
    const { socket } = scripted([]);
    const reach = reaching(power('standby'), { open: vi.fn(async () => socket) });

    await expect(pass(reach)).resolves.toBe('needsPower');
  });

  it('needs a person on a platform that cannot open its remote service', async () => {
    await expect(pass(reaching(power('standby')))).resolves.toBe('needsPower');
  });
});

describe('a Samsung set that answers nothing', () => {
  it('gets the packet where the platform can send one', async () => {
    const magic = vi.fn(async () => undefined);

    const result = await pass(reaching(null, { magic }));

    expect(result).toBe('asked');
    expect(magic).toHaveBeenCalledExactlyOnceWith('a0:b1:c2:d3:e4:f5');
  });

  it('needs a person where no packet can be sent', async () => {
    await expect(pass(reaching(null))).resolves.toBe('needsPower');
  });
});
