import type { CastWakeStep } from '@kromatv/client/cast';
import { lg } from './lg';
import { sendPacket, type WakeReach, type WakeResult } from './reach';
import { samsung } from './samsung';

type KnockStep = Extract<CastWakeStep, { type: 'knock' }>;

// A request is the knock: the television wakes for it, whatever it answers.
async function knock(step: KnockStep, reach: WakeReach): Promise<WakeResult> {
  await reach.http('GET', `http://${step.address}:${step.port}/`);
  return 'asked';
}

/** Make one pass over one step. A caller repeats the pass until the television
 * arrives: running a step twice changes nothing. A step this build does not
 * know is skipped. */
export function runWakeStep(step: CastWakeStep, reach: WakeReach): Promise<WakeResult> {
  if (step.type === 'samsung') {
    return samsung(step, reach);
  }
  if (step.type === 'lg') {
    return lg(step, reach);
  }
  if (step.type === 'knock') {
    return knock(step, reach);
  }
  if (step.type === 'magic') {
    return sendPacket(step.mac, reach);
  }
  return Promise.resolve(step.type === 'manual' ? 'needsPower' : 'skipped');
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
