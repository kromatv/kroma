import type { Source } from '../../install/artifact';
import { olderThan } from '../../shared/version';
import type { TizenPackage } from './package-manifest';

const OTHER_AUTHOR = /author certificate not match/i;
const INSTALL_FAILED = /install failed\[/i;

/** The refusal of a set that already has a KROMA another author signed. */
export class OtherAuthor extends Error {}

/** Whether a set refused a package for want of Samsung's certificates for it. */
export const refusedChain = (output: string): boolean =>
  output.includes('certificate') && !OTHER_AUTHOR.test(output);

/**
 * What to tell the owner about an install a Samsung set refused. An app signed
 * by another author has to be removed first, a refusal that names a certificate
 * otherwise is the one that needs Samsung, and every other one is quoted.
 */
export function installFailure(output: string, profile: string | null, duid: string | null): Error {
  if (OTHER_AUTHOR.test(output)) {
    return new OtherAuthor(
      'another author signed the KROMA already on this set, and a set updates an app only under the signature that installed it. Delete KROMA on the TV (Apps, hold the select button on its tile, Delete) and install again, or pass --profile with the Tizen Studio profile that installed it',
    );
  }
  if (!refusedChain(output)) {
    const tail = quoted(output);
    const said = tail ? `: ${tail}` : '';
    return new Error(`the install failed${said}`);
  }
  const rejected = profile ? `profile ${profile} signed it and the set refused that chain. ` : '';
  const set = duid ? ` The DUID of this set is ${duid}.` : '';
  return new Error(
    `${rejected}A retail Samsung takes only certificates Samsung issued for its own DUID: the certificate command of this tool gets them, with the address of the set.${set}`,
  );
}

/**
 * Why a set that runs Tizen `platform` would refuse this package, or null when
 * nothing says it would. A set answers a package that asks for a newer Tizen
 * than its own with a bare `install failed[118]`, so this is said before the push.
 */
export function belowPackageFloor(
  platform: string | undefined,
  tizenPackage: TizenPackage,
  source?: Source,
): Error | null {
  const needs = tizenPackage.requiredVersion;
  if (!platform || !needs || !olderThan(platform, needs)) {
    return null;
  }
  const canary =
    source === 'canary'
      ? ''
      : ' The canary build reaches older sets: choose Canary when the installer asks which version, or pass --source canary.';
  return new Error(
    `this set runs Tizen ${platform}, and this KROMA needs Tizen ${needs} or later, so the set would refuse it.${canary}`,
  );
}

function quoted(output: string): string {
  const lines = output
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const failed = lines.filter((line) => INSTALL_FAILED.test(line));
  return (failed.length > 0 ? failed : lines.slice(-2)).join(' / ');
}
