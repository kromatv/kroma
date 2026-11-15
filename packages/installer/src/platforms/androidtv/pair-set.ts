import { mdnsPort } from '../../discovery/mdns';
import { kromaKey } from './adb/key';
import { pairWithCode } from './adb/pairing/pair';
import { ADB_PAIRING_SERVICE } from './endpoint';

const PAIRING_WAIT_MS = 8000;

export const PAIRING_STEPS =
  'on the TV, open Developer options, Wireless debugging, Pair device with pairing code';

/** The TV has no pairing code on screen, so nothing listens for one. */
export class NoPairingCode extends Error {}

/** A pairing code is six digits, whatever spaces were typed around or inside it. */
export function pairingCode(typed: string): string | null {
  const digits = typed.replaceAll(/\s/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Pairs this computer with a set, from the code it shows under Wireless
 * debugging. The set says where it listens for the code only while the code is
 * on screen.
 */
export async function pairSet(host: string, code: string, waitMs = PAIRING_WAIT_MS): Promise<void> {
  const port = await mdnsPort(host, ADB_PAIRING_SERVICE, waitMs);
  if (port === null) {
    throw new NoPairingCode(
      `the TV shows no pairing code: ${PAIRING_STEPS}, and leave it on screen`,
    );
  }
  await pairWithCode({ host, port, code, key: await kromaKey() });
}
