import type { CastWakeStep } from '@kromatv/client/cast';
import { z } from 'zod';
import { awaited, parsed } from './frames';
import {
  type LanSocket,
  sendPacket,
  type WakeAnswer,
  type WakeReach,
  type WakeResult,
} from './reach';

type SamsungStep = Extract<CastWakeStep, { type: 'samsung' }>;

const HTTP_PORT = 8001;
const REMOTE_PORT = 8002;
// "KROMA" in base64, which is how the set wants the name it shows.
const NAME = 'S1JPTUE=';
const POWER_KEY = 'KEY_POWER';
const NOT_FOUND = 404;
// Long enough for somebody to pick up the remote and accept the prompt the set
// shows the first time; a set that already gave a token answers at once.
const PAIR_WITHIN_MS = 60_000;
const ANSWER_WITHIN_MS = 8000;
// The set drops a key it is still reading when the socket closes under it.
const KEY_LANDING_MS = 600;
const REFUSALS = new Set(['ms.channel.unauthorized', 'ms.channel.timeOut']);

const Info = z.object({
  device: z.object({ PowerState: z.string().optional() }),
});

// A set sends the token as a string on one firmware and as a number on another.
const Greeting = z.object({
  event: z.string(),
  data: z.object({ token: z.union([z.string(), z.number()]).optional() }).optional(),
});

function inStandby(answer: WakeAnswer): boolean {
  const info = Info.safeParse(parsed(answer.text));
  return info.success && info.data.device.PowerState?.toLowerCase() === 'standby';
}

function remoteUrl(address: string, token: string | null): string {
  const url = `wss://${address}:${REMOTE_PORT}/api/v2/channels/samsung.remote.control`;
  const query = `name=${encodeURIComponent(NAME)}`;
  return token ? `${url}?${query}&token=${encodeURIComponent(token)}` : `${url}?${query}`;
}

// The set greets a connection it accepts, and the greeting carries the token
// it wants sent back the next time. A set that will not take a key now, or
// that nobody accepted this device on, says so instead.
function welcomed(frame: unknown): { token: string | null } | undefined {
  const greeting = Greeting.safeParse(frame);
  if (!greeting.success) {
    return undefined;
  }
  if (REFUSALS.has(greeting.data.event)) {
    throw new Error('refused');
  }
  if (greeting.data.event !== 'ms.channel.connect') {
    return undefined;
  }
  const token = greeting.data.data?.token;
  return { token: token === undefined ? null : String(token) };
}

function pressing(key: string): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

function landed(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, KEY_LANDING_MS);
  });
}

async function press(socket: LanSocket, withinMs: number): Promise<string | null> {
  const { token } = await awaited(socket, withinMs, welcomed);
  await socket.send(pressing(POWER_KEY));
  await landed();
  return token;
}

// The set's remote service is where its power key is. A platform that cannot
// open it, and a set that does not welcome the connection, both leave the key
// to a person.
async function powerOn(address: string, reach: WakeReach): Promise<WakeResult> {
  const known = (await reach.keys?.get(address)) ?? null;
  const socket = await reach.open(remoteUrl(address, known)).catch(() => null);
  if (!socket) {
    return 'needsPower';
  }
  try {
    const given = await press(socket, known ? ANSWER_WITHIN_MS : PAIR_WITHIN_MS);
    if (given) {
      await reach.keys?.set(address, given);
    }
    return 'asked';
  } catch {
    return 'needsPower';
  } finally {
    socket.close();
  }
}

/** One pass over a Samsung set. In standby it keeps its network on and
 * answers, so it is switched on by the power key. Once it is on, or showing
 * art, it is asked for the app. A set that does not answer at all gets the
 * packet. */
export async function samsung(step: SamsungStep, reach: WakeReach): Promise<WakeResult> {
  const base = `http://${step.address}:${HTTP_PORT}/api/v2`;
  const info = await reach.http('GET', `${base}/`);
  if (!info) {
    return sendPacket(step.mac, reach);
  }
  if (inStandby(info)) {
    return powerOn(step.address, reach);
  }
  const launched = await reach.http('POST', `${base}/applications/${step.appId}`);
  return launched?.status === NOT_FOUND ? 'refused' : 'asked';
}
