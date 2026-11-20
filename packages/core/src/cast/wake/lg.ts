import type { CastWakeStep } from '@kromatv/client/cast';
import { z } from 'zod';
import { awaited } from './frames';
import { type LanSocket, sendPacket, type WakeReach, type WakeResult } from './reach';

type LgStep = Extract<CastWakeStep, { type: 'lg' }>;

// LG's own control service. Newer sets answer on the encrypted port alone, with
// a certificate the set signed for itself; older ones on the plain port alone.
const ENCRYPTED_PORT = 3001;
const PLAIN_PORT = 3000;
const LAUNCH_URI = 'ssap://system.launcher/launch';
const REGISTER_ID = 'register';
const LAUNCH_ID = 'launch';
// Long enough for somebody to accept the prompt the set shows the first time;
// a set that already gave a key answers at once.
const PAIR_WITHIN_MS = 60_000;
const ANSWER_WITHIN_MS = 8000;

const Frame = z.object({
  type: z.string(),
  id: z.string().optional(),
  payload: z
    .object({
      'client-key': z.string().optional(),
      returnValue: z.boolean().optional(),
    })
    .optional(),
});

function firstOpen(address: string, reach: WakeReach): Promise<LanSocket | null> {
  return reach
    .open(`wss://${address}:${ENCRYPTED_PORT}`)
    .catch(() => reach.open(`ws://${address}:${PLAIN_PORT}`))
    .catch(() => null);
}

function registering(key: string | null): string {
  return JSON.stringify({
    type: 'register',
    id: REGISTER_ID,
    payload: {
      pairingType: 'PROMPT',
      'client-key': key ?? undefined,
      manifest: { manifestVersion: 1, permissions: ['LAUNCH'] },
    },
  });
}

// The set says `registered` when it accepts, with the key it wants sent back
// the next time. Before that it may say that it is showing a prompt.
function registered(frame: unknown): { key: string | undefined } | undefined {
  const said = Frame.safeParse(frame);
  if (!said.success) {
    return undefined;
  }
  if (said.data.type === 'error') {
    throw new Error('refused');
  }
  return said.data.type === 'registered' ? { key: said.data.payload?.['client-key'] } : undefined;
}

// The set answers a known key at once. An unknown one makes it show a prompt
// and wait for somebody to accept.
async function register(socket: LanSocket, address: string, reach: WakeReach): Promise<void> {
  const known = (await reach.keys?.get(address)) ?? null;
  await socket.send(registering(known));
  const { key } = await awaited(socket, known ? ANSWER_WITHIN_MS : PAIR_WITHIN_MS, registered);
  if (key) {
    await reach.keys?.set(address, key);
  }
}

function launched(frame: unknown): WakeResult | undefined {
  const said = Frame.safeParse(frame);
  if (!(said.success && said.data.id === LAUNCH_ID)) {
    return undefined;
  }
  const failed = said.data.type === 'error' || said.data.payload?.returnValue === false;
  return failed ? 'refused' : 'asked';
}

async function launch(socket: LanSocket, appId: string): Promise<WakeResult> {
  await socket.send(
    JSON.stringify({ type: 'request', id: LAUNCH_ID, uri: LAUNCH_URI, payload: { id: appId } }),
  );
  return awaited(socket, ANSWER_WITHIN_MS, launched);
}

async function open(socket: LanSocket, step: LgStep, reach: WakeReach): Promise<WakeResult> {
  try {
    await register(socket, step.address, reach);
  } catch {
    return 'needsPower';
  }
  return launch(socket, step.appId).catch((): WakeResult => 'asked');
}

/** One pass over an LG set. A set that is off answers nothing and gets the
 * packet, which it wakes for when its own "turn on by network" setting is on.
 * A set that is on is asked, over its own control service, to open the app;
 * the first time, it asks a person to accept this device. */
export async function lg(step: LgStep, reach: WakeReach): Promise<WakeResult> {
  const socket = await firstOpen(step.address, reach);
  if (!socket) {
    return sendPacket(step.mac, reach);
  }
  try {
    return await open(socket, step, reach);
  } finally {
    socket.close();
  }
}
