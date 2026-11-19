import type { CastWakeStep } from '@kromatv/client/cast';
import { z } from 'zod';

/** What an answer from a device on the network carried. */
export interface WakeAnswer {
  status: number;
  text: string;
}

/**
 * What this platform can do to a television on its own network. Every platform
 * can ask over HTTP. A browser can do nothing else: it has no datagram, and a
 * television's remote service sits behind a certificate the set signed for
 * itself, which a page may not accept. A native app provides the rest.
 */
export interface WakeReach {
  /** An HTTP request to a device on the network, or `null` when nothing answered. */
  http: (method: 'GET' | 'POST', url: string) => Promise<WakeAnswer | null>;
  /** Press one remote key on a Samsung set, over its own remote service. */
  samsungKey?: (address: string, key: string) => Promise<void>;
  /** Broadcast a Wake-on-LAN packet for this hardware address. */
  magic?: (mac: string) => Promise<void>;
}

/**
 * How one pass over a step ended. `asked` means something was sent and the
 * television may now be on its way; `needsPower` means the television is off
 * and this platform has no way to switch it on, so a person has to; `refused`
 * means the television answered that it cannot do what was asked, and asking
 * again will not change that.
 */
export type WakeResult = 'asked' | 'needsPower' | 'refused' | 'skipped';

const SAMSUNG_PORT = 8001;
const POWER_KEY = 'KEY_POWER';
const NOT_FOUND = 404;

const SamsungInfo = z.object({
  device: z.object({ PowerState: z.string().optional() }),
});

function samsungBase(address: string): string {
  return `http://${address}:${SAMSUNG_PORT}/api/v2`;
}

function inStandby(answer: WakeAnswer): boolean {
  try {
    const info = SamsungInfo.safeParse(JSON.parse(answer.text));
    return info.success && info.data.device.PowerState?.toLowerCase() === 'standby';
  } catch {
    return false;
  }
}

type SamsungStep = Extract<CastWakeStep, { type: 'samsung' }>;

async function powerUnanswered(step: SamsungStep, reach: WakeReach): Promise<WakeResult> {
  if (!(step.mac && reach.magic)) {
    return 'needsPower';
  }
  await reach.magic(step.mac);
  return 'asked';
}

// In standby a Samsung set keeps its network on and answers, so it is switched
// on by the power key. Once it is on, or showing art, it is asked for the app.
async function samsung(step: SamsungStep, reach: WakeReach): Promise<WakeResult> {
  const base = samsungBase(step.address);
  const info = await reach.http('GET', `${base}/`);
  if (!info) {
    return powerUnanswered(step, reach);
  }
  if (inStandby(info)) {
    if (!reach.samsungKey) {
      return 'needsPower';
    }
    await reach.samsungKey(step.address, POWER_KEY);
    return 'asked';
  }
  const launched = await reach.http('POST', `${base}/applications/${step.appId}`);
  return launched?.status === NOT_FOUND ? 'refused' : 'asked';
}

async function magic(mac: string, reach: WakeReach): Promise<WakeResult> {
  if (!reach.magic) {
    return 'needsPower';
  }
  await reach.magic(mac);
  return 'asked';
}

/** Make one pass over one step. A caller repeats the pass until the television
 * arrives: nothing here waits, and running a step twice changes nothing. */
export function runWakeStep(step: CastWakeStep, reach: WakeReach): Promise<WakeResult> {
  if (step.type === 'samsung') {
    return samsung(step, reach);
  }
  if (step.type === 'magic') {
    return magic(step.mac, reach);
  }
  return Promise.resolve('skipped');
}

const BY_WEIGHT: WakeResult[] = ['refused', 'needsPower', 'asked'];

/** One pass over every step. The heaviest ending wins: `refused`, then
 * `needsPower`, then `asked`. */
export async function runWakeSteps(steps: CastWakeStep[], reach: WakeReach): Promise<WakeResult> {
  const results = await Promise.all(
    steps.map((step) => runWakeStep(step, reach).catch((): WakeResult => 'skipped')),
  );
  return BY_WEIGHT.find((ending) => results.includes(ending)) ?? 'skipped';
}

const HTTP_TIMEOUT_MS = 3000;

/** The reach every platform has: HTTP, and nothing else. A request that fails,
 * is refused or takes longer than three seconds is nothing answering. */
export const httpReach: WakeReach = {
  http: async (method, url) => {
    try {
      const reply = await fetch(url, { method, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      return { status: reply.status, text: await reply.text() };
    } catch {
      return null;
    }
  },
};
