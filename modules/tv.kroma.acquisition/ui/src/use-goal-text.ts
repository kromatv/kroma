import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { qualityResolution } from './fact-labels';
import type { GoalFormat, GoalFormats, QualityRung, Shortfall, TargetGoal } from './quality-target';
import { useQualityLabel } from './use-quality-label';

type Translate = ReturnType<typeof useT>;

export function useRungLabel(): (rung: QualityRung) => string {
  const label = useQualityLabel();
  return useCallback(
    (rung) => {
      switch (rung.kind) {
        case 'named':
          return rung.name;
        case 'quality':
          return label(rung.quality);
        case 'resolution':
          return rung.resolution;
        case 'qualities':
          return rung.qualities.map(label).join(' / ');
      }
    },
    [label],
  );
}

/** The goal in one line, the way a person asks for it: « 1080p en VFF ». */
export function useGoalHeadline(): (goal: TargetGoal) => string {
  const t = useT();
  const rungLabel = useRungLabel();
  return useCallback(
    (goal) => {
      const quality = rungLabel(goal.rung);
      const { formats } = goal;
      if (formats.kind === 'none') return quality;
      if (formats.kind === 'score') {
        return t('acq.goal.withScore', { quality, score: formats.score });
      }
      return t('acq.goal.withFormats', { quality, formats: named(t, formats) });
    },
    [t, rungLabel],
  );
}

/** One shortfall in plain words: « 720p, l'objectif est 1080p », « sans VFF ». */
export function useShortfallText(): (shortfall: Shortfall, goal: TargetGoal) => string {
  const t = useT();
  const label = useQualityLabel();
  const rungLabel = useRungLabel();
  return useCallback(
    (shortfall, goal) => {
      switch (shortfall.kind) {
        case 'refused':
          return t('acq.short.refused', { quality: label(shortfall.quality) });
        case 'lower': {
          const resolution = shortfall.byResolution ? qualityResolution(shortfall.quality) : null;
          const have = resolution ?? label(shortfall.quality);
          return t('acq.short.lower', { have, goal: rungLabel(goal.rung) });
        }
        case 'ranked':
          return t('acq.short.ranked', { quality: label(shortfall.quality) });
        case 'missing':
          return t('acq.short.missing', { formats: neither(t, shortfall.formats) });
        case 'score':
          return t('acq.short.score', { score: shortfall.score, need: shortfall.need });
      }
    },
    [t, label, rungLabel],
  );
}

function named(t: Translate, formats: Extract<GoalFormats, { kind: 'one' | 'either' | 'both' }>) {
  if (formats.kind === 'one') return formats.format.name;
  const [first, second] = formats.formats;
  const key = formats.kind === 'either' ? 'acq.goal.either' : 'acq.goal.both';
  return t(key, { first: first.name, second: second.name });
}

function neither(t: Translate, formats: readonly GoalFormat[]): string {
  const [head = '', ...rest] = formats.map((format) => format.name);
  return rest.reduce((first, second) => t('acq.short.nor', { first, second }), head);
}
