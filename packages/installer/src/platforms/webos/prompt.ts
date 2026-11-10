import * as p from '@clack/prompts';
import type { Television } from '../../shared/television';
import type { PlatformOptions } from '../platform';

/** The Dev Mode passphrase of every LG set, by host. Null when the user cancelled. */
export async function askPassphrases(
  sets: readonly Television[],
): Promise<Map<string, PlatformOptions> | null> {
  p.log.info(
    'The Dev Mode app on the television shows the passphrase.\n' +
      'Leave it empty when this computer already holds the key.',
  );

  const passphrases = new Map<string, PlatformOptions>();
  for (const tv of sets) {
    const answer = await p.password({ message: `passphrase for ${tv.name} (${tv.host})` });
    if (p.isCancel(answer)) return null;
    if (answer) passphrases.set(tv.host, { passphrase: answer });
  }
  return passphrases;
}
