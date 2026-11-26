const COUNTRY = /^[A-Z]{2}$/;

/** Whether the kit draws a flag for `region`: any uppercase ISO 3166 code. */
export function isFlagRegion(region: string | null | undefined): region is string {
  return typeof region === 'string' && COUNTRY.test(region);
}
