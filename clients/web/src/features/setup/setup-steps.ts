import { SetupStart as Starts, SetupStep as Steps } from '@kromatv/client/setup';

export const SETUP_STEPS = Steps.options;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STARTS = Starts.options;

export type SetupStart = (typeof SETUP_STARTS)[number];

/** Who is looking at the setup: someone before the owner exists, or the owner. */
export type SetupVisitor = 'stranger' | 'owner';

const OWNER_AT = SETUP_STEPS.indexOf('owner');

const STEP_NAMES: ReadonlySet<unknown> = new Set(SETUP_STEPS);
const START_NAMES: ReadonlySet<unknown> = new Set(SETUP_STARTS);

export function isSetupStep(value: unknown): value is SetupStep {
  return STEP_NAMES.has(value);
}

export function isSetupStart(value: unknown): value is SetupStart {
  return START_NAMES.has(value);
}

/** The step an address names, or the first one. */
export function readSetupStep(value: unknown): SetupStep {
  return isSetupStep(value) ? value : 'language';
}

/** The start an address names, or a fresh one. */
export function readSetupStart(value: unknown): SetupStart {
  return isSetupStart(value) ? value : 'fresh';
}

/** The steps of a setup that began with `start`. The import is a step only for
 * an owner who brings another server over. */
export function stepsFor(start: SetupStart): readonly SetupStep[] {
  return start === 'bring' ? SETUP_STEPS : SETUP_STEPS.filter((step) => step !== 'import');
}

/** The step after `step`, or `step` itself at the end of the setup. */
export function stepAfter(step: SetupStep, start: SetupStart = 'fresh'): SetupStep {
  const steps = stepsFor(start);
  return steps[steps.indexOf(step) + 1] ?? step;
}

/** The step before `step`, or none at the first one. */
export function stepBefore(step: SetupStep, start: SetupStart = 'fresh'): SetupStep | null {
  const steps = stepsFor(start);
  return steps[steps.indexOf(step) - 1] ?? null;
}

/** The one of two steps that comes later in the setup. */
export function laterStep(one: SetupStep, other: SetupStep): SetupStep {
  return SETUP_STEPS.indexOf(one) >= SETUP_STEPS.indexOf(other) ? one : other;
}

/** The steps a person has been to once they have reached `reached`: it, and
 * every step before it. */
export function stepsUpTo(reached: SetupStep, start: SetupStart = 'fresh'): readonly SetupStep[] {
  return stepsFor(start).filter(
    (step) => SETUP_STEPS.indexOf(step) <= SETUP_STEPS.indexOf(reached),
  );
}

/** Whether a person may leave `step` without answering it. */
export function canSkip(step: SetupStep): boolean {
  return SETUP_STEPS.indexOf(step) > OWNER_AT && step !== 'done';
}

/** The steps a person answers, which is every step but the last screen. */
export function answeredSteps(start: SetupStart = 'fresh'): readonly SetupStep[] {
  return stepsFor(start).filter((step) => step !== 'done');
}

/** The steps already behind `step`. */
export function stepsBehind(step: SetupStep, start: SetupStart = 'fresh'): readonly SetupStep[] {
  return stepsFor(start).filter((held) => SETUP_STEPS.indexOf(held) < SETUP_STEPS.indexOf(step));
}

/** The step `visitor` may see when the address asks for `step`. Nothing after
 * the owner account opens before it exists. The owner may open any step of
 * their setup, the earlier ones included, to change an answer. A step that is
 * not part of a setup that began with `start` gives way to the one after it. */
export function stepOpenTo(
  step: SetupStep,
  visitor: SetupVisitor,
  start: SetupStart = 'fresh',
): SetupStep {
  const afterOwner = SETUP_STEPS.indexOf(step) > OWNER_AT;
  if (visitor === 'stranger' && afterOwner) {
    return 'language';
  }
  return stepsFor(start).includes(step) ? step : 'media';
}
