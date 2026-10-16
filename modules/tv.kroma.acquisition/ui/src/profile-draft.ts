import type { QualityId, QualityProfile, QualityTier } from './rules-schemas';

/** Every quality the profile allows, best first. */
export function allowedQualities(profile: QualityProfile): QualityId[] {
  return profile.tiers.filter((tier) => tier.allowed).flatMap((tier) => tier.qualities);
}

/** Swaps a tier with its neighbour, or returns the profile untouched when it is
 *  already at the end it is moving towards. */
export function moveTier(profile: QualityProfile, index: number, delta: number): QualityProfile {
  const to = index + delta;
  if (index < 0 || index >= profile.tiers.length || to < 0 || to >= profile.tiers.length) {
    return profile;
  }
  const tiers = [...profile.tiers];
  const moved = tiers[index] as QualityTier;
  tiers[index] = tiers[to] as QualityTier;
  tiers[to] = moved;
  return withCutoffAllowed({ ...profile, tiers });
}

export function setTierAllowed(
  profile: QualityProfile,
  index: number,
  allowed: boolean,
): QualityProfile {
  const tiers = profile.tiers.map((tier, at) => (at === index ? { ...tier, allowed } : tier));
  return withCutoffAllowed({ ...profile, tiers });
}

function withCutoffAllowed(profile: QualityProfile): QualityProfile {
  const allowed = allowedQualities(profile);
  if (allowed.length === 0 || allowed.includes(profile.cutoff)) return profile;
  return { ...profile, cutoff: allowed[0] as QualityId };
}

/** A score of zero is the absence of a score, so it leaves the map rather than
 *  being stored: the server reads a format it does not name as zero. */
export function setFormatScore(
  profile: QualityProfile,
  formatId: string,
  score: number,
): QualityProfile {
  const formatScores = { ...profile.formatScores };
  if (score === 0) delete formatScores[formatId];
  else formatScores[formatId] = score;
  return { ...profile, formatScores };
}

export function copyOfProfile(
  source: QualityProfile,
  name: string,
  taken: readonly string[],
): QualityProfile {
  return {
    ...source,
    id: freeId(name, taken),
    name,
    tiers: source.tiers.map((tier) => ({ ...tier, qualities: [...tier.qualities] })),
    formatScores: { ...source.formatScores },
    mustContain: [...source.mustContain],
    mustNotContain: [...source.mustNotContain],
  };
}

/** A slug of `name` that no profile holds yet. */
export function freeId(name: string, taken: readonly string[]): string {
  const slug =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'profile';
  if (!taken.includes(slug)) return slug;
  let suffix = 2;
  while (taken.includes(`${slug}-${suffix}`)) suffix += 1;
  return `${slug}-${suffix}`;
}

export function termsOf(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function termsText(terms: readonly string[]): string {
  return terms.join('\n');
}
