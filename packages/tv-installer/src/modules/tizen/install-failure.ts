const OTHER_AUTHOR = /author certificate not match/i;

/** Whether a set refused a package for want of Samsung's certificates for it. */
export const refusedChain = (output: string): boolean =>
  output.includes('certificate') && !OTHER_AUTHOR.test(output);

/**
 * What to tell the owner about an install a Samsung set refused. An app signed
 * by another author has to be removed first, a refusal that names a certificate
 * otherwise is the one that needs Samsung, and every other one is quoted.
 */
export function installFailure(
  output: string,
  profile: string | null,
  duid: string | null,
): string {
  if (OTHER_AUTHOR.test(output)) {
    return 'another author signed the KROMA already on this set, and a set updates an app only under the signature that installed it. Delete KROMA on the TV (Apps, hold the select button on its tile, Delete) and install again, or pass --profile with the Tizen Studio profile that installed it';
  }
  if (!refusedChain(output)) {
    const tail = output.split('\n').filter(Boolean).slice(-2).join(' / ');
    const said = tail ? `: ${tail}` : '';
    return `the install failed${said}`;
  }
  const rejected = profile ? `profile ${profile} signed it and the set refused that chain. ` : '';
  const set = duid ? ` The DUID of this set is ${duid}.` : '';
  return `${rejected}A retail Samsung takes only certificates Samsung issued for its own DUID: the certificate command of this tool gets them, with the address of the set.${set}`;
}
