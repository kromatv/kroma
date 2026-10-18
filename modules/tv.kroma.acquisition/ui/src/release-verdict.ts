import type { ReleaseVerdict, VerdictReason } from '@kromatv/client/requests';

export type VerdictTone = 'success' | 'accentText' | 'info' | 'textDim';

export function verdictLabelKey(verdict: ReleaseVerdict): string {
  return `acq.verdict.${verdict.kind}`;
}

export function verdictReasonKey(verdict: ReleaseVerdict): string | null {
  return verdict.kind === 'fill' ? null : reasonKey(verdict.reason);
}

export function reasonKey(reason: VerdictReason): string {
  return `acq.reason.${reason}`;
}

const TONE: Record<ReleaseVerdict['kind'], VerdictTone> = {
  fill: 'success',
  upgrade: 'accentText',
  beside: 'info',
  notBetter: 'textDim',
};

export function verdictTone(verdict: ReleaseVerdict): VerdictTone {
  return TONE[verdict.kind];
}
