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

interface Context {
  t: Translate;
  bytes: Bytes;
  params: Params;
}

type Sentence = (context: Context) => string;

function sizeSentence(key: string): Sentence {
  return ({ t, bytes, params }) =>
    t(key, {
      size: bytes(count(params, 'sizeBytes')),
      limit: bytes(count(params, 'limitBytes')),
    });
}

function shortfall(key: string): Sentence {
  return ({ t, params }) => t(key, { have: count(params, 'have'), need: count(params, 'need') });
}

const SENTENCES = new Map<string, Sentence>([
  [
    'quality',
    ({ t, params }) =>
      t('acq.refusal.quality', {
        quality: qualityLabel(text(params, 'quality')) ?? t('acq.qualityUnknown'),
      }),
  ],
  ['format-score', shortfall('acq.refusal.formatScore')],
  ['seeders', shortfall('acq.refusal.seeders')],
  [
    'forbidden-keyword',
    ({ t, params }) => t('acq.refusal.forbiddenKeyword', { term: text(params, 'term') }),
  ],
  [
    'missing-required-keyword',
    ({ t, params }) => t('acq.refusal.missingKeyword', { terms: text(params, 'terms') }),
  ],
  ['too-small', sizeSentence('acq.refusal.tooSmall')],
  ['too-big', sizeSentence('acq.refusal.tooBig')],
  [
    'size-unknown',
    ({ t, bytes, params }) =>
      t('acq.refusal.sizeUnknown', { limit: bytes(count(params, 'limitBytes')) }),
  ],
  [
    'wrong-shape',
    ({ t, params }) =>
      t('acq.refusal.wrongShape', {
        wanted: shapeName(t, params, 'wanted'),
        found: shapeName(t, params, 'found'),
      }),
  ],
  [
    'wrong-year',
    ({ t, params }) =>
      t('acq.refusal.wrongYear', {
        year: count(params, 'year'),
        wantedYear: count(params, 'wantedYear'),
      }),
  ],
  [
    'wrong-season',
    ({ t, params }) =>
      t('acq.refusal.wrongSeason', {
        season: count(params, 'season'),
        wantedSeason: count(params, 'wantedSeason'),
      }),
  ],
  [
    'wrong-episode',
    ({ t, params }) =>
      t('acq.refusal.wrongEpisode', {
        unit: unit(count(params, 'season'), count(params, 'episode')),
        wanted: unit(count(params, 'wantedSeason'), count(params, 'wantedEpisode')),
      }),
  ],
  ['blocklist', ({ t }) => t('acq.refusal.blocklist')],
]);

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
      if (!refusal) {
        return fallback ?? null;
      }
      const write = SENTENCES.get(refusal.rule);
      if (!write) {
        return fallback ?? t('acq.refusal.other');
      }
      return write({ t, bytes: fmt.bytes, params: refusal.params });
    },
    [t, fmt],
  );
}
