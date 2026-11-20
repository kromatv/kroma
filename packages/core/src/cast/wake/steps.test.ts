import type { CastWakeStep } from '@kromatv/client/cast';
import { describe, expect, it, vi } from 'vitest';
import { runWakeStep, runWakeSteps } from './steps';
import { reaching } from './testing';

const PACKET: CastWakeStep = { type: 'magic', mac: 'a0:b1:c2:d3:e4:f5' };
const KNOCK: CastWakeStep = { type: 'knock', address: '192.168.1.30', port: 7000 };

describe('the packet step', () => {
  it('is sent where the platform has a datagram', async () => {
    const magic = vi.fn(async () => undefined);

    await expect(runWakeStep(PACKET, reaching(null, { magic }))).resolves.toBe('asked');
    expect(magic).toHaveBeenCalledWith('a0:b1:c2:d3:e4:f5');
  });

  it('needs a person where it has none', async () => {
    await expect(runWakeStep(PACKET, reaching(null))).resolves.toBe('needsPower');
  });
});

describe('the knock step', () => {
  it('is one request to the port, whatever comes back', async () => {
    const reach = reaching(null);

    await expect(runWakeStep(KNOCK, reach)).resolves.toBe('asked');
    expect(reach.http).toHaveBeenCalledExactlyOnceWith('GET', 'http://192.168.1.30:7000/');
  });
});

describe('the manual step', () => {
  it('always needs a person', async () => {
    await expect(runWakeStep({ type: 'manual' }, reaching(null))).resolves.toBe('needsPower');
  });
});

describe('one pass over the steps', () => {
  it('skips a step this build does not know', async () => {
    await expect(runWakeSteps([{ type: 'unknown' }], reaching(null))).resolves.toBe('skipped');
  });

  it('reports that a person is needed as soon as one step says so', async () => {
    await expect(runWakeSteps([PACKET, KNOCK], reaching(null))).resolves.toBe('needsPower');
  });

  it('carries on past a step that throws', async () => {
    const reach = reaching(null);
    reach.http.mockRejectedValue(new Error('offline'));

    await expect(runWakeSteps([KNOCK], reach)).resolves.toBe('skipped');
  });
});
