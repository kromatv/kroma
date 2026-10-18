import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { type ConditionMode, modeOf } from './condition-mode';
import { useConditionText } from './condition-text';
import type { Condition } from './rules-schemas';

const CLAUSE: Record<ConditionMode, string> = {
  required: 'acq.summaryRequired',
  optional: 'acq.summaryOptional',
  excluded: 'acq.summaryExcluded',
};

const ORDER: readonly ConditionMode[] = ['required', 'optional', 'excluded'];

export function useFormatSummary(): (conditions: readonly Condition[]) => string {
  const t = useT();
  const conditionText = useConditionText();
  return useCallback(
    (conditions) => {
      const clauses = ORDER.map((mode) => {
        const named = conditions.filter((one) => modeOf(one) === mode).map(conditionText);
        return named.length === 0 ? null : t(CLAUSE[mode], { list: named.join(', ') });
      }).filter((clause) => clause !== null);
      return clauses.length === 0 ? t('acq.formatNoConditions') : clauses.join(' ');
    },
    [t, conditionText],
  );
}
