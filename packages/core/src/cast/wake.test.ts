import type { CastWakeStep } from '@kromatv/client/cast';
import { describe, expect, it, vi } from 'vitest';
import { runWakeStep, runWakeSteps, type WakeAnswer, type WakeReach } from './wake';

const SET: CastWakeStep = {
  type: 'samsung',
  address: '192.168.1.20',
  mac: 'a0:b1:c2:d3:e4:f5',
  appId: 'KromaTV002.KROMA',
};
const INFO = 'http://192.168.1.20:8001/api/v2/';
const LAUNCH = 'http://192.168.1.20:8001/api/v2/applications/KromaTV002.KROMA';

const power = (state: string): WakeAnswer => ({
  status: 200,
  text: JSON.stringify({ device: { PowerState: state } }),
});

function reaching(info: WakeAnswer | null, extra: Partial<WakeReach> = {}) {
  const http = vi.fn(async (method: 'GET' | 'POST') =>
    method === 'GET' ? info : { status: 200, text: 'true' },
  );
  return { http, ...extra };
}

describe('a Samsung set', () => {
  it('is asked for the app when it is on', async () => {
    const reach = reaching(power('on'));

    const result = await runWakeStep(SET, reach);

    expect(result).toBe('asked');
    expect(reach.http).toHaveBeenCalledWith('GET', INFO);
    expect(reach.http).toHaveBeenCalledWith('POST', LAUNCH);
  });

  it('is switched on by the power key when it is in standby and the platform can', async () => {
    const samsungKey = vi.fn(async () => undefined);
    const reach = reaching(power('standby'), { samsungKey });

    const result = await runWakeStep(SET, reach);

    expect(result).toBe('asked');
    expect(samsungKey).toHaveBeenCalledExactlyOnceWith('192.168.1.20', 'KEY_POWER');
    expect(reach.http).not.toHaveBeenCalledWith('POST', LAUNCH);
  });

  it('needs a person when it is in standby and the platform has no way to switch it on', async () => {
    const reach = reaching(power('standby'));

    await expect(runWakeStep(SET, reach)).resolves.toBe('needsPower');
  });

  it('gets the packet when it answers nothing and the platform can send one', async () => {
    const magic = vi.fn(async () => undefined);
    const reach = reaching(null, { magic });

    const result = await runWakeStep(SET, reach);

    expect(result).toBe('asked');
    expect(magic).toHaveBeenCalledExactlyOnceWith('a0:b1:c2:d3:e4:f5');
  });

  it('needs a person when it answers nothing and no packet can be sent', async () => {
    await expect(runWakeStep(SET, reaching(null))).resolves.toBe('needsPower');
  });

  it('refuses for good when it does not know the app it is asked for', async () => {
    const reach: WakeReach = {
      http: vi.fn(async (method: 'GET' | 'POST') =>
        method === 'GET' ? power('on') : { status: 404, text: '' },
      ),
    };

    await expect(runWakeStep(SET, reach)).resolves.toBe('refused');
  });

  it('is treated as on when its answer is not the document expected', async () => {
    const reach = reaching({ status: 200, text: '<html>' });

    await expect(runWakeStep(SET, reach)).resolves.toBe('asked');
  });
});

describe('the packet step', () => {
  const step: CastWakeStep = { type: 'magic', mac: 'a0:b1:c2:d3:e4:f5' };

  it('is sent where the platform has a datagram', async () => {
    const magic = vi.fn(async () => undefined);

    await expect(runWakeStep(step, reaching(null, { magic }))).resolves.toBe('asked');
    expect(magic).toHaveBeenCalledWith('a0:b1:c2:d3:e4:f5');
  });

  it('needs a person where it has none', async () => {
    await expect(runWakeStep(step, reaching(null))).resolves.toBe('needsPower');
  });
});

describe('one pass over the steps', () => {
  it('skips a step this build does not know', async () => {
    await expect(runWakeSteps([{ type: 'unknown' }], reaching(null))).resolves.toBe('skipped');
  });

  it('reports that a person is needed as soon as one step says so', async () => {
    const steps: CastWakeStep[] = [{ type: 'magic', mac: 'a0:b1:c2:d3:e4:f5' }, SET];

    await expect(runWakeSteps(steps, reaching(power('on')))).resolves.toBe('needsPower');
  });

  it('carries on past a step that throws', async () => {
    const reach: WakeReach = {
      http: vi.fn(async () => {
        throw new Error('offline');
      }),
    };

    await expect(runWakeSteps([SET], reach)).resolves.toBe('skipped');
  });
});
