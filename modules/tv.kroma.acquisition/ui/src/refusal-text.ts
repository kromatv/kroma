import { useFormat, useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { qualityLabel } from './fact-labels';

export interface RefusalLike {
  rule: string;
  params: Readonly<Record<string, unknown>>;
}

type Translate = ReturnType<typeof useT>;
type Bytes = (bytes: number) => string;

const SHAPES: Record<string, string> = {
  movie: 'acq.shapeMovie',
  episode: 'acq.shapeEpisode',
  season: 'acq.shapeSeason',
  none: 'acq.shapeNone',
};

type Params = RefusalLike['params'];

function text(params: Params, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

function count(params: Params, key: string): number {
  const value = params[key];
  return typeof value === 'number' ? value : 0;
}

function unit(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function shapeName(t: Translate, params: Params, key: string): string {
  return t(SHAPES[text(params, key)] ?? 'acq.shapeNone');
}

function sizeSentence(t: Translate, bytes: Bytes, key: string, params: Params): string {
  return t(key, {
    size: bytes(count(params, 'sizeBytes')),
    limit: bytes(count(params, 'limitBytes')),
  });
}

function shortfall(t: Translate, key: string, params: Params): string {
  return t(key, { have: count(params, 'have'), need: count(params, 'need') });
}

function sentence(t: Translate, bytes: Bytes, { rule, params }: RefusalLike): string | null {
  switch (rule) {
    case 'quality':
      return t('acq.refusal.quality', {
        quality: qualityLabel(text(params, 'quality')) ?? t('acq.qualityUnknown'),
      });
    case 'format-score':
      return shortfall(t, 'acq.refusal.formatScore', params);
    case 'seeders':
      return shortfall(t, 'acq.refusal.seeders', params);
    case 'forbidden-keyword':
      return t('acq.refusal.forbiddenKeyword', { term: text(params, 'term') });
    case 'missing-required-keyword':
      return t('acq.refusal.missingKeyword', { terms: text(params, 'terms') });
    case 'too-small':
      return sizeSentence(t, bytes, 'acq.refusal.tooSmall', params);
    case 'too-big':
      return sizeSentence(t, bytes, 'acq.refusal.tooBig', params);
    case 'wrong-shape':
      return t('acq.refusal.wrongShape', {
        wanted: shapeName(t, params, 'wanted'),
        found: shapeName(t, params, 'found'),
      });
    case 'wrong-year':
      return t('acq.refusal.wrongYear', {
        year: count(params, 'year'),
        wantedYear: count(params, 'wantedYear'),
      });
    case 'wrong-season':
      return t('acq.refusal.wrongSeason', {
        season: count(params, 'season'),
        wantedSeason: count(params, 'wantedSeason'),
      });
    case 'wrong-episode':
      return t('acq.refusal.wrongEpisode', {
        unit: unit(count(params, 'season'), count(params, 'episode')),
        wanted: unit(count(params, 'wantedSeason'), count(params, 'wantedEpisode')),
      });
    case 'blocklist':
      return t('acq.refusal.blocklist');
    default:
      return null;
  }
}

/** The refusal written out in the reader's language. A rule this build does
 *  not know falls back to the English the server also sent, and then to a
 *  sentence that at least says a rule refused it. */
export function useRefusalText(): (
  refusal: RefusalLike | null | undefined,
  fallback?: string | null,
) => string | null {
  const t = useT();
  const fmt = useFormat();
  return useCallback(
    (refusal, fallback) => {
      if (!refusal) return fallback ?? null;
      return sentence(t, fmt.bytes, refusal) ?? fallback ?? t('acq.refusal.other');
    },
    [t, fmt],
  );
}
