export type AndroidFormFactor = 'mobile' | 'tv';

// Play shares one version-code namespace across an app's form-factor tracks.
// Reserve a decimal digit for each build; Apple keeps the original build number.
export function androidVersionCode(build: number, formFactor: AndroidFormFactor): number {
  const code = build * 10 + (formFactor === 'tv' ? 1 : 0);
  if (!Number.isSafeInteger(build) || build < 1 || code > 2_100_000_000) {
    throw new Error('Android build number must produce a version code between 1 and 2100000000');
  }
  return code;
}
