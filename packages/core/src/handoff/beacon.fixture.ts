import { KromaApiError, type KromaClient, type PairingStatus, type User } from '@kroma/client';
import { vi } from 'vitest';
import type { HandoffBeaconView, HandoffLoopOptions } from './beacon';
import { startHandoff } from './beacon';

export const USER = { id: 'u1', username: 'owner' } as unknown as User;

export const BEACON = {
  handle: 'h1',
  secret: 's1',
  check: 'K7QMR',
  confirmRequired: false,
  proof: 'p1',
  instanceId: 'srv-1',
  ttlSecs: 60,
  pollSecs: 3,
};

export function stubClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const announces: Array<{ deviceId: string; name: string; prevSecret?: string }> = [];
  const left: string[] = [];
  let minted = 0;
  const client = {
    announceHandoff: vi.fn(
      async (body: { deviceId: string; name: string; prevSecret?: string }) => {
        calls.push('announce');
        announces.push(body);
        minted += 1;
        return { ...BEACON, secret: `s${minted}`, handle: `h${minted}`, proof: `p${minted}` };
      },
    ),
    handoffPoll: vi.fn(async (): Promise<PairingStatus> => {
      calls.push('poll');
      return { status: 'pending' };
    }),
    handoffLeave: vi.fn(async (secret: string) => {
      calls.push('leave');
      left.push(secret);
    }),
    ...overrides,
  } as unknown as KromaClient;
  return { client, calls, announces, left };
}

export function run(client: KromaClient, publish?: HandoffLoopOptions['publish']) {
  const beacons: Array<HandoffBeaconView | null> = [];
  const signedIn: Array<{ token: string }> = [];
  const handoff = startHandoff({
    client,
    deviceId: 'tv-salon-01',
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
  return vi.fn(async () => {
    throw new KromaApiError(status, `POST ${route} failed (${status})`);
  });
}
