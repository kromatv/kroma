import * as SQUARE from 'country-flag-icons/string/1x1';

const FLAGS: Readonly<Record<string, string | undefined>> = SQUARE;

/** The square flag of `region` as an SVG document, if it is at hand now. A
 *  native bundle holds every flag, so it always is. */
export function flagSvgNow(region: string): string | undefined {
  return Object.hasOwn(FLAGS, region) ? FLAGS[region] : undefined;
}

/** The square flag of `region`, once it is at hand, or nothing where there is
 *  none. */
export async function fetchFlagSvg(region: string): Promise<string | undefined> {
  return await Promise.resolve(flagSvgNow(region));
}
