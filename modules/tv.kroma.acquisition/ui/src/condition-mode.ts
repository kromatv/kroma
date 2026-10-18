import type { Condition } from './rules-schemas';

export type ConditionMode = 'required' | 'optional' | 'excluded';

export const CONDITION_MODES: readonly ConditionMode[] = ['required', 'optional', 'excluded'];

export const MODE_LABEL: Record<ConditionMode, string> = {
  required: 'acq.modeRequired',
  optional: 'acq.modeOptional',
  excluded: 'acq.modeExcluded',
};

export function modeOf(condition: Pick<Condition, 'negate' | 'required'>): ConditionMode {
  if (condition.negate) return 'excluded';
  return condition.required ? 'required' : 'optional';
}

export function withMode(condition: Condition, mode: ConditionMode): Condition {
  if (mode === 'excluded') return { ...condition, required: true, negate: true };
  return { ...condition, required: mode === 'required', negate: false };
}
