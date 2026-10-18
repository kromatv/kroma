import type { CustomFormat, QualityProfile } from './rules-schemas';

/** The dub ladder, best first. */
const DUB_ORDER = ['VFF', 'VF2', 'MULTi', 'VFQ', 'VO'] as const;
export type Dub = (typeof DUB_ORDER)[number];

const ALIASES: Record<Dub, readonly string[]> = {
  VFF: ['vff', 'truefrench', 'vf france', 'french france'],
  VF2: ['vf2'],
  MULTi: ['multi'],
  VFQ: ['vfq', 'quebec', 'québec'],
  VO: ['vo', 'vost', 'vostfr', 'original'],
};

const TOP_SCORE = 1000;
const STEP = 100;

export function dubFormats(formats: readonly CustomFormat[]): Map<Dub, CustomFormat> {
  const found = new Map<Dub, CustomFormat>();
  for (const dub of DUB_ORDER) {
    const match = formats.find((format) => matches(format.name, dub));
    if (match) found.set(dub, match);
  }
  return found;
}

function matches(name: string, dub: Dub): boolean {
  const lowered = name.toLowerCase();
  return (ALIASES[dub] ?? []).some((alias) => lowered.includes(alias));
}

function topOtherScore(profile: QualityProfile, dubs: ReadonlyMap<Dub, CustomFormat>): number {
  const dubIds = new Set([...dubs.values()].map((format) => format.id));
  const others = Object.entries(profile.formatScores)
    .filter(([id]) => !dubIds.has(id))
    .map(([, score]) => score);
  return others.length === 0 ? 0 : Math.max(...others);
}

export interface DubScore {
  dub: Dub;
  format: CustomFormat;
  score: number;
}

export function dubScores(profile: QualityProfile, formats: readonly CustomFormat[]): DubScore[] {
  const dubs = dubFormats(formats);
  const floor = topOtherScore(profile, dubs);
  const rungs = [...dubs.keys()];
  return rungs.map((dub, at) => ({
    dub,
    format: dubs.get(dub) as CustomFormat,
    score: dub === 'VO' ? 0 : floor + TOP_SCORE - at * STEP,
  }));
}

export function withDubScores(
  profile: QualityProfile,
  scores: readonly DubScore[],
): QualityProfile {
  const formatScores = { ...profile.formatScores };
  for (const { format, score } of scores) {
    if (score === 0) delete formatScores[format.id];
    else formatScores[format.id] = score;
  }
  return { ...profile, formatScores };
}

export function bestPositiveScore(profile: QualityProfile): number {
  const positive = Object.values(profile.formatScores).filter((score) => score > 0);
  return positive.length === 0 ? 0 : Math.max(...positive);
}
