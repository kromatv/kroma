import { DeviceId, KromaApiError, type KromaClient } from '@kromatv/client';
import type { PairingStatus, User } from '@kromatv/client/accounts';
import { type HandoffAnnounce, type HandoffBeacon, HandoffHandle } from '@kromatv/client/handoff';
import { fakeClient } from '@kromatv/client/test';
import { vi } from 'vitest';
import type { HandoffBeaconView, HandoffLoopOptions } from './beacon';
import { startHandoff } from './beacon';

export const USER = { id: 'u1', username: 'owner' } as unknown as User;

export const DEVICE = DeviceId.parse('tv-salon-01');

export const BEACON: HandoffBeacon = {
  handle: HandoffHandle.parse('h1'),
  secret: 's1',
  check: 'K7QMR',
  confirmRequired: false,
  proof: 'p1',
  instanceId: 'srv-1',
  ttlSecs: 60,
  pollSecs: 3,
};

export function stubClient(overrides: Partial<KromaClient['handoff']> = {}) {
  const calls: string[] = [];
  const announces: HandoffAnnounce[] = [];
  const left: string[] = [];
  let minted = 0;
  const handoff = {
    announce: vi.fn((body: HandoffAnnounce) => {
      calls.push('announce');
      announces.push(body);
      minted += 1;
      return Promise.resolve({
        ...BEACON,
        secret: `s${minted}`,
        handle: HandoffHandle.parse(`h${minted}`),
        proof: `p${minted}`,
      });
    }),
    poll: vi.fn((): Promise<PairingStatus> => {
      calls.push('poll');
      return Promise.resolve({ status: 'pending' });
    }),
    leave: vi.fn((secret: string) => {
      calls.push('leave');
      left.push(secret);
      return Promise.resolve();
    }),
    ...overrides,
  };
  const client = fakeClient({ handoff });
  return { client, calls, announces, left };
}

export function run(client: KromaClient, publish?: HandoffLoopOptions['publish']) {
  const beacons: Array<HandoffBeaconView | null> = [];
  const signedIn: Array<{ token: string }> = [];
  const handoff = startHandoff({
    client,
    deviceId: DEVICE,
    name: 'Apple TV',
    platform: 'Apple TV',
    publish,
    onBeacon: (b) => beacons.push(b),
    onAuthenticated: (r) => signedIn.push({ token: r.token }),
  });
  return { ...handoff, beacons, signedIn };
}

// Let every already-resolved promise settle, then advance to the next timer.
export async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

export function refusing(status: number, route = '/handoff/announce') {
  return vi.fn(() => Promise.reject(new KromaApiError(status, `POST ${route} failed (${status})`)));
}
