import { BR, CN, DE, ES, FR, JP, KR, US, VN } from 'country-flag-icons/string/1x1';

const FLAG_SVG = { BR, CN, DE, ES, FR, JP, KR, US, VN } as const satisfies Record<string, string>;

/** An ISO 3166 country the kit draws the flag of. */
export type FlagRegion = keyof typeof FLAG_SVG;

/** Whether the kit draws the flag of `region`, an uppercase ISO 3166 code. */
export function isFlagRegion(region: string | null): region is FlagRegion {
  return region !== null && Object.hasOwn(FLAG_SVG, region);
}

/** Every country the kit draws the flag of. */
export const FLAG_SVG_REGIONS: readonly FlagRegion[] = Object.keys(FLAG_SVG).filter(isFlagRegion);

/** The flag of `region` as an SVG document, square. */
export function flagSvg(region: FlagRegion): string {
  return FLAG_SVG[region];
}
