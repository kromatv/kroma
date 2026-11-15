import * as p from '@clack/prompts';
import type { Television } from '../../shared/television';
import type { PlatformOptions } from '../platform';
import { AdbConnection, AdbUnpaired } from './adb/connection';
import { adbKeys } from './adb/key';
import { adbEndpoint } from './endpoint';
import { PAIRING_STEPS, pairingCode, pairSet } from './pair-set';

const PROBE_TIMEOUT_MS = 5000;

async function wantsPairing(host: string): Promise<boolean> {
  const endpoint = await adbEndpoint(host);
  if (!endpoint?.wireless) {
    return false;
  }
  try {
    const keys = await adbKeys();
    (await AdbConnection.open(host, endpoint.port, { keys, timeoutMs: PROBE_TIMEOUT_MS })).close();
    return false;
  } catch (error) {
    return error instanceof AdbUnpaired;
  }
}

async function pair(tv: Television): Promise<boolean> {
  for (;;) {
    const typed = await p.text({
      message: `pairing code for ${tv.name} (${tv.host})`,
      validate: (value) =>
        pairingCode(value ?? '') === null ? 'the six digits the TV shows' : undefined,
    });
    if (p.isCancel(typed)) {
      return false;
    }
    try {
      await pairSet(tv.host, pairingCode(typed) ?? '');
      p.log.success(`${tv.name} is paired with this computer`);
      return true;
    } catch (error) {
      p.log.warn(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Pairs this computer with every Android set on Wireless debugging that does
 * not trust it yet, from the code each one shows. A set in Network debugging,
 * or one already paired, is asked nothing. Null when the user cancelled.
 */
export async function askPairingCodes(
  sets: readonly Television[],
): Promise<Map<string, PlatformOptions> | null> {
  let explained = false;
  for (const tv of sets) {
    if (!(await wantsPairing(tv.host))) {
      continue;
    }
    if (!explained) {
      p.log.info(`To pair, ${PAIRING_STEPS}.\nThe code stays on screen until it is used.`);
    }
    explained = true;
    if (!(await pair(tv))) {
      return null;
    }
  }
  return new Map();
}
