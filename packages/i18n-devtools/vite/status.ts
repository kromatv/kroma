import {
  confirm,
  coverage,
  inspectLocale,
  localesOf,
  readSource,
  type Tally,
} from '@kromatv/i18n-tools';
import { z } from 'zod';
import { Locale, locate, parsed, reasonOf, type Sets, Target } from './sets.ts';

const Asked = z.object({ locale: Locale });

interface Pending {
  readonly scope: string | null;
  readonly outdated: readonly string[];
  readonly unreviewed: readonly string[];
}

interface TranslationStatus {
  readonly locale: string;
  readonly coverage: number;
  readonly missing: number;
  readonly outdated: number;
  readonly unreviewed: number;
  readonly sets: readonly Pending[];
}

interface StatusAnswer {
  readonly status: TranslationStatus | null;
  readonly refused: string | null;
}

interface ConfirmAnswer {
  readonly settled: readonly string[];
  readonly refused: string | null;
}

const COUNTS = ['total', 'translated', 'unreviewed', 'inherited', 'outdated', 'missing'] as const;

function summed(tallies: readonly Tally[]): Tally {
  const sum: Tally = {
    total: 0,
    translated: 0,
    unreviewed: 0,
    inherited: 0,
    outdated: 0,
    missing: 0,
  };
  for (const tally of tallies) for (const count of COUNTS) sum[count] += tally[count];
  return sum;
}

/**
 * How the locale `payload` names stands, across every set of `sets`, the first
 * of which is the app's. Refused for a locale no set keeps a catalog for.
 */
export function describeStatus(sets: Sets, payload: unknown): StatusAnswer {
  const asked = parsed(Asked, payload);
  if (typeof asked === 'string') return { status: null, refused: asked };
  try {
    const { locale } = asked;
    const all = sets();
    if (!all.some((set) => localesOf(set).includes(locale))) {
      return { status: null, refused: `no catalog is kept for ${locale}` };
    }
    const statuses = all.map((set) => ({
      name: set.name,
      ...inspectLocale(set, readSource(set), locale),
    }));
    const tally = summed(statuses.map((status) => status.tally));
    const status = {
      locale,
      coverage: coverage(tally),
      missing: tally.missing,
      outdated: tally.outdated,
      unreviewed: tally.unreviewed,
      sets: statuses.map(({ name, outdated, unreviewed }, at) => ({
        scope: at === 0 ? null : name,
        outdated,
        unreviewed,
      })),
    };
    return { status, refused: null };
  } catch (error) {
    return { status: null, refused: reasonOf(error) };
  }
}

/**
 * Record that the translation `payload` names holds as it reads: an outdated
 * one is current again, a machine-written one is reviewed. Answers the keys
 * that had something to settle, and refuses the source language, which has no
 * translation to vouch for.
 */
export function confirmMessage(sets: Sets, payload: unknown): ConfirmAnswer {
  const target = parsed(Target, payload);
  if (typeof target === 'string') return { settled: [], refused: target };
  try {
    const at = locate(sets, target);
    if (typeof at === 'string') return { settled: [], refused: at };
    if (target.locale === at.source.locale) {
      return { settled: [], refused: `${target.locale} is the source language` };
    }
    return { settled: confirm(at.set, target.locale, [target.key]), refused: null };
  } catch (error) {
    return { settled: [], refused: reasonOf(error) };
  }
}
