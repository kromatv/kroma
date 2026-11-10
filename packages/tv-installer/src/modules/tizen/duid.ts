import type { SdbDevice } from './sdb';

const DUID_COMMAND = '0 getduid';
const TIMEOUT_MS = 20_000;
const LIMIT = 256;

/** The id Samsung binds a distributor certificate to, as the set itself says it. */
export async function duidOf(device: Pick<SdbDevice, 'shell'>): Promise<string | null> {
  const printed = await device
    .shell(DUID_COMMAND, { limit: LIMIT, timeoutMs: TIMEOUT_MS })
    .catch(() => '');
  return printed.trim() || null;
}
