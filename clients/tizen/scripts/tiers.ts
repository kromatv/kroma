export type Tier = 'modern' | 'legacy' | 'deep';

export interface TierPackage {
  /** The `required_version` a package of this tier alone declares, so a set below it refuses the install rather than showing a black screen. */
  requiredVersion: string;
  /** What the file is called: `KROMA-<name>-<version>.wgt`. */
  name: string;
  label: string;
}

/**
 * The three engine tiers `dist/` carries and chooses between at runtime, each
 * as the package a known set downloads on its own. The floors follow
 * `tv.target.ts`: Tizen 8.0 (Chromium 108) is the first to run the modern
 * bundle, Tizen 4.0 (Chromium 56) the first the legacy bundle is built for,
 * and only a Tizen 3.0 set (2017) falls through to the deep one.
 */
export const TIERS: Readonly<Record<Tier, TierPackage>> = {
  modern: { requiredVersion: '8.0', name: 'tizen8', label: 'Tizen 8.0 and newer (2024+)' },
  legacy: { requiredVersion: '4.0', name: 'tizen4to7', label: 'Tizen 4.0 to 7.0 (2018 to 2023)' },
  deep: { requiredVersion: '3.0', name: 'tizen3', label: 'Tizen 3.0 (2017)' },
};

export const TIER_NAMES = Object.keys(TIERS) as Tier[];
