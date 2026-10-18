import { qualityResolution } from './fact-labels';
import type { Evaluation } from './judgement-schemas';
import type { CustomFormat, QualityId, QualityProfile, QualityTier } from './rules-schemas';

export type GoalFormat = Pick<CustomFormat, 'id' | 'name'>;

/** How a file reaches the profile's upgrade-until score: one format, either of
 *  two, both of the only pair that adds up, or a bare score when none of those
 *  explains it. */
export type GoalFormats =
  | { kind: 'none' }
  | { kind: 'one'; format: GoalFormat }
  | { kind: 'either'; formats: readonly [GoalFormat, GoalFormat] }
  | { kind: 'both'; formats: readonly [GoalFormat, GoalFormat] }
  | { kind: 'score'; score: number };

/** The cutoff rung as a person names it: the name it was given, its only
 *  quality, the resolution its qualities share, or the qualities themselves. */
export type QualityRung =
  | { kind: 'named'; name: string }
  | { kind: 'quality'; quality: QualityId }
  | { kind: 'resolution'; resolution: string }
  | { kind: 'qualities'; qualities: readonly QualityId[] };

export interface TargetGoal {
  kind: 'target';
  rung: QualityRung;
  formats: GoalFormats;
  tiers: readonly (readonly QualityId[])[];
  cutoffTier: number;
  need: number;
}

/** What a profile asks of a file before it stops upgrading it. `keep` is a
 *  profile that never upgrades, so the first accepted file stays. */
export type QualityGoal = { kind: 'keep' } | TargetGoal;

export function goalOf(
  profile: QualityProfile | undefined,
  formats: readonly GoalFormat[],
): QualityGoal | null {
  if (!profile) return null;
  if (!profile.upgradesAllowed) return { kind: 'keep' };
  const tiers = profile.tiers.filter((tier) => tier.allowed);
  const cutoffTier = tiers.findIndex((tier) => tier.qualities.includes(profile.cutoff));
  return {
    kind: 'target',
    rung: rungOf(tiers[cutoffTier] ?? { qualities: [profile.cutoff] }),
    formats: goalFormats(profile, formats),
    tiers: tiers.map((tier) => tier.qualities),
    cutoffTier,
    need: profile.upgradeUntilScore,
  };
}

function rungOf(tier: Pick<QualityTier, 'name' | 'qualities'>): QualityRung {
  const name = tier.name?.trim();
  if (name) return { kind: 'named', name };
  const [only, ...rest] = tier.qualities;
  if (only !== undefined && rest.length === 0) return { kind: 'quality', quality: only };
  const resolutions = new Set(tier.qualities.map(qualityResolution));
  const [resolution] = resolutions;
  return resolutions.size === 1 && resolution
    ? { kind: 'resolution', resolution }
    : { kind: 'qualities', qualities: tier.qualities };
}

function goalFormats(profile: QualityProfile, formats: readonly GoalFormat[]): GoalFormats {
  const need = profile.upgradeUntilScore;
  if (need <= 0) return { kind: 'none' };
  const scored = formats
    .map(({ id, name }) => ({ format: { id, name }, score: profile.formatScores[id] ?? 0 }))
    .filter((one) => one.score > 0);
  const [first, second, ...more] = scored
    .filter((one) => one.score >= need)
    .map((one) => one.format);
  if (first && !second) return { kind: 'one', format: first };
  if (first && second && more.length === 0) return { kind: 'either', formats: [first, second] };
  if (first) return { kind: 'score', score: need };
  const [pair, ...others] = scored.flatMap((one, at) =>
    scored
      .slice(at + 1)
      .filter((other) => one.score + other.score >= need)
      .map((other) => [one.format, other.format] as const),
  );
  return pair && others.length === 0
    ? { kind: 'both', formats: pair }
    : { kind: 'score', score: need };
}

/** One reason a file falls short of its goal, in the terms the goal is said
 *  in. `byResolution` names a lower file by its resolution, because the rung is
 *  named by one. */
export type Shortfall =
  | { kind: 'refused'; quality: QualityId }
  | { kind: 'lower'; quality: QualityId; byResolution: boolean }
  | { kind: 'ranked'; quality: QualityId }
  | { kind: 'missing'; formats: readonly GoalFormat[] }
  | { kind: 'score'; score: number; need: number };

export function shortfallsOf(goal: QualityGoal | null, evaluation: Evaluation): Shortfall[] {
  if (goal?.kind !== 'target') return [];
  const quality = qualityShortfall(goal, evaluation);
  const formats = evaluation.formatScore < goal.need ? formatShortfall(goal, evaluation) : null;
  return [quality, formats].filter((one) => one !== null);
}

function qualityShortfall(goal: TargetGoal, evaluation: Evaluation): Shortfall | null {
  const { quality } = evaluation;
  const at = goal.tiers.findIndex((tier) => tier.includes(quality));
  if (evaluation.qualityRank === null || at === -1) return { kind: 'refused', quality };
  if (goal.cutoffTier === -1 || at <= goal.cutoffTier) return null;
  if (goal.rung.kind !== 'resolution') return { kind: 'lower', quality, byResolution: false };
  return qualityResolution(quality) === goal.rung.resolution
    ? { kind: 'ranked', quality }
    : { kind: 'lower', quality, byResolution: true };
}

function formatShortfall(goal: TargetGoal, evaluation: Evaluation): Shortfall {
  const held = new Set(evaluation.formats.map((format) => format.id));
  const missing = wanted(goal.formats).filter((format) => !held.has(format.id));
  const explains = goal.formats.kind === 'either' ? missing.length === 2 : missing.length > 0;
  return explains
    ? { kind: 'missing', formats: missing }
    : { kind: 'score', score: evaluation.formatScore, need: goal.need };
}

function wanted(formats: GoalFormats): readonly GoalFormat[] {
  switch (formats.kind) {
    case 'one':
      return [formats.format];
    case 'either':
    case 'both':
      return formats.formats;
    case 'none':
    case 'score':
      return [];
  }
}
