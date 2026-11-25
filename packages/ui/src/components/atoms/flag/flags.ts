const COUNTRY = /^[A-Z]{2}$/;

/** Whether the kit draws a flag for `region`: any uppercase ISO 3166 code. */
export function isFlagRegion(region: string | null): region is string {
  return region !== null && COUNTRY.test(region);
}
