/**
 * What to tell the owner about an install a Samsung set refused. A refusal that
 * names a certificate is the one that needs Samsung: every other one is quoted.
 */
export function installFailure(
  output: string,
  profile: string | null,
  duid: string | null,
): string {
  if (!output.includes('certificate')) {
    const tail = output.split('\n').filter(Boolean).slice(-2).join(' / ');
    const said = tail ? `: ${tail}` : '';
    return `the install failed${said}`;
  }
  const rejected = profile ? `profile ${profile} signed it and the set refused that chain. ` : '';
  const set = duid ? ` The DUID to register is ${duid}.` : '';
  return `${rejected}A retail Samsung takes only a distributor certificate Samsung issued for its own DUID: Tizen Studio, Certificate Manager, Samsung, TV, with the set connected.${set}`;
}
