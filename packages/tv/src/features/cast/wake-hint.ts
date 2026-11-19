import { CastWakeHint } from '@kromatv/client/cast';

const HINT_TIMEOUT_MS = 3000;

/** Asks the platform what this set can say about reaching itself: its hardware
 * address, its address on the network, its own app id. Only the shell knows
 * which vendor API answers, so the shell hands this in. */
export type WakeHintSource = () => Promise<unknown>;

/** The shell's answer once checked, or `undefined` when there is no source, it
 * failed, it said nothing usable, or it took longer than three seconds. */
export async function readWakeHint(source?: WakeHintSource): Promise<CastWakeHint | undefined> {
  if (!source) {
    return undefined;
  }
  const answer = await Promise.race([source().catch(() => undefined), timeout()]);
  const hint = CastWakeHint.safeParse(answer);
  if (!hint.success || Object.values(hint.data).every((value) => !value)) {
    return undefined;
  }
  return hint.data;
}

function timeout(): Promise<undefined> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, HINT_TIMEOUT_MS);
  });
}
