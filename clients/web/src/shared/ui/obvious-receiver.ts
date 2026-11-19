import type { CastReceiver } from '@kromatv/client/cast';

/** The television a press plays on with nothing asked: the one already being
 * driven, else the only one there is. `null` when the person has to choose. */
export function obviousReceiver(
  receivers: CastReceiver[],
  active: CastReceiver | null,
): CastReceiver | null {
  if (active) {
    return active;
  }
  return receivers.length === 1 ? (receivers[0] ?? null) : null;
}
