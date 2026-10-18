import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import type { Evaluation } from './judgement-schemas';
import { allowedQualities } from './profile-draft';
import type { QualityId, QualityProfile } from './rules-schemas';
import { useQualityLabel } from './use-quality-label';

export interface QualityTarget {
  cutoff: QualityId;
  upgradeUntilScore: number;
}

export function targetOf(profile: QualityProfile | undefined): QualityTarget | null {
  if (!profile) return null;
  return { cutoff: profile.cutoff, upgradeUntilScore: profile.upgradeUntilScore };
}

export type BelowReason =
  | { kind: 'quality'; quality: QualityId; cutoff: QualityId }
  | { kind: 'score'; score: number; need: number };

export function belowReason(
  profile: QualityProfile | undefined,
  evaluation: Evaluation,
): BelowReason | null {
  if (!profile) return null;
  const ladder = allowedQualities(profile);
  const at = ladder.indexOf(evaluation.quality);
  const cutoffAt = ladder.indexOf(profile.cutoff);
  if (at === -1 || (cutoffAt !== -1 && at > cutoffAt)) {
    return { kind: 'quality', quality: evaluation.quality, cutoff: profile.cutoff };
  }
  if (evaluation.formatScore < profile.upgradeUntilScore) {
    return { kind: 'score', score: evaluation.formatScore, need: profile.upgradeUntilScore };
  }
  return null;
}

export function useBelowReasonText(): (reason: BelowReason | null) => string | null {
  const t = useT();
  const label = useQualityLabel();
  return useCallback(
    (reason) => {
      if (!reason) return null;
      if (reason.kind === 'quality') {
        return t('acq.belowQuality', {
          quality: label(reason.quality),
          cutoff: label(reason.cutoff),
        });
      }
      return t('acq.belowScore', { score: reason.score, need: reason.need });
    },
    [t, label],
  );
}
