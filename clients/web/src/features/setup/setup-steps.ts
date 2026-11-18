export const SETUP_STEPS = [
  'language',
  'start',
  'owner',
  'media',
  'modules',
  'people',
  'privacy',
  'done',
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STARTS = ['fresh', 'bring'] as const;

export type SetupStart = (typeof SETUP_STARTS)[number];

/** Who is looking at the setup: someone before the owner exists, or the owner. */
export type SetupVisitor = 'stranger' | 'owner';

const OWNER_AT = SETUP_STEPS.indexOf('owner');

export function isSetupStep(value: unknown): value is SetupStep {
  return SETUP_STEPS.some((step) => step === value);
}

export function isSetupStart(value: unknown): value is SetupStart {
  return SETUP_STARTS.some((start) => start === value);
}

/** The step an address names, or the first one. */
export function readSetupStep(value: unknown): SetupStep {
  return isSetupStep(value) ? value : 'language';
}

/** The start an address names, or a fresh one. */
export function readSetupStart(value: unknown): SetupStart {
  return isSetupStart(value) ? value : 'fresh';
}

/** The step after `step`, or `step` itself at the end of the setup. */
export function stepAfter(step: SetupStep): SetupStep {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? step;
}

/** The step before `step`, or none at the first one. */
export function stepBefore(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) - 1] ?? null;
}

/** Whether a person may leave `step` without answering it. */
export function canSkip(step: SetupStep): boolean {
  return SETUP_STEPS.indexOf(step) > OWNER_AT && step !== 'done';
}

/** The steps a person answers, which is every step but the last screen. */
export function answeredSteps(): readonly SetupStep[] {
  return SETUP_STEPS.filter((step) => step !== 'done');
}

/** The one of two steps that comes later in the setup. */
export function laterStep(one: SetupStep, other: SetupStep): SetupStep {
  return SETUP_STEPS.indexOf(one) >= SETUP_STEPS.indexOf(other) ? one : other;
}

/** The steps a person has been to once they have reached `reached`: it, and
 * every step before it. */
export function stepsUpTo(reached: SetupStep): readonly SetupStep[] {
  return SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(reached) + 1);
}

/** The steps already behind `step`. */
export function stepsBehind(step: SetupStep): readonly SetupStep[] {
  return SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(step));
}

/** The step `visitor` may see when the address asks for `step`. Nothing after
 * the owner account opens before it exists. The owner may open any step, the
 * earlier ones included, to change an answer. */
export function stepOpenTo(step: SetupStep, visitor: SetupVisitor): SetupStep {
  const afterOwner = SETUP_STEPS.indexOf(step) > OWNER_AT;
  return visitor === 'stranger' && afterOwner ? 'language' : step;
}
