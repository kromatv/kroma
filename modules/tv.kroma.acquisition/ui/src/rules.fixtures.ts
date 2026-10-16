import type { Evaluation, QualityId, QualityProfile } from './rules-schemas';

export function profile(over: Partial<QualityProfile> = {}): QualityProfile {
  return {
    id: 'default',
    name: 'Par defaut',
    tiers: [
      { name: null, qualities: ['remux-2160p'], allowed: true },
      { name: null, qualities: ['webdl-1080p', 'bluray-1080p'], allowed: true },
      { name: null, qualities: ['webdl-720p'], allowed: true },
    ],
    cutoff: 'webdl-1080p',
    upgradesAllowed: true,
    formatScores: { hevc: 400 },
    minFormatScore: 0,
    upgradeUntilScore: 0,
    minUpgradeIncrement: 1,
    mustContain: [],
    mustNotContain: [],
    minSeeders: 0,
    addBeside: false,
    ...over,
  };
}

export function evaluation(quality: QualityId, rank: number | null, score = 0): Evaluation {
  return { quality, qualityRank: rank, formats: [], formatScore: score, revision: 1 };
}
