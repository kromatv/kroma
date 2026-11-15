import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { qualityLabel } from './fact-labels';

export interface ScoreLineLike {
  rule: string;
  code?: string;
  note: string;
  params?: Readonly<Record<string, unknown>>;
}

function text(line: ScoreLineLike, key: string): string {
  const value = line.params?.[key];
  return typeof value === 'string' ? value : '';
}

function count(line: ScoreLineLike, key: string): number {
  const value = line.params?.[key];
  return typeof value === 'number' ? value : 0;
}

export function useScoreLineText(): (line: ScoreLineLike) => string {
  const t = useT();
  return useCallback(
    (line) => {
      switch (line.code || line.rule) {
        case 'quality':
          return t('acq.score.quality', {
            quality: qualityLabel(text(line, 'quality')) ?? t('acq.qualityUnknown'),
          });
        case 'format':
          return text(line, 'format') || line.note;
        case 'revision':
          return t('acq.score.revision', { revision: count(line, 'revision') });
        case 'season-pack':
          return t('acq.score.seasonPack', { count: count(line, 'episodes') });
        default:
          return line.note;
      }
    },
    [t],
  );
}
