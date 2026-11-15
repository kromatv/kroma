import type { InstallContext, PlatformOptions } from '../platform';
import { duidAt } from './duid';
import { OtherAuthor } from './install-failure';
import { activeProfile, type SigningProfile } from './profiles';
import { coversSet, readSamsungProfile } from './samsung/profile';

interface Signer {
  profile: SigningProfile;
  named: string | undefined;
}

/**
 * Installs as the profile chosen, then once as the other author this computer
 * holds when the set says another one signed the KROMA it has: the
 * certificates Samsung issued to this tool, or the profile Tizen Studio signs
 * with. Answers the `profile` option of the author the set took, to remember
 * it for that set, and the first refusal when it took neither.
 */
export async function eitherAuthor(
  { tv, log }: Pick<InstallContext, 'tv' | 'log'>,
  chosen: SigningProfile,
  install: (profile: SigningProfile) => Promise<void>,
): Promise<PlatformOptions> {
  try {
    await install(chosen);
    return {};
  } catch (refusal) {
    const other = refusal instanceof OtherAuthor ? await otherSigner(tv.host, chosen) : null;
    if (!other) {
      throw refusal;
    }

    log("another author signed the KROMA on this set, trying this computer's other certificate");
    await install(other.profile).catch(() => {
      throw refusal;
    });
    return { profile: other.named };
  }
}

async function otherSigner(host: string, refused: SigningProfile): Promise<Signer | null> {
  const issued = readSamsungProfile();
  if (issued && keyOf(issued) !== keyOf(refused) && (await listed(host))) {
    return { profile: issued, named: undefined };
  }
  const studio = await activeProfile();
  return studio && keyOf(studio) !== keyOf(refused)
    ? { profile: studio, named: studio.name }
    : null;
}

async function listed(host: string): Promise<boolean> {
  const duid = await duidAt(host).catch(() => null);
  return duid !== null && coversSet(duid);
}

function keyOf({ author }: SigningProfile): string {
  return 'archive' in author ? author.archive : author.key;
}
