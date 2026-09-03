import { z } from 'zod';

/** A nominal `string` id: a `UserId` can never be passed where an `ItemId` is
 * expected. `UserId.parse(s)` turns a raw string into one, and rejects an empty
 * id rather than carrying it into a URL. Each id is declared by the domain that
 * owns it; only the ones no single domain owns live here. */
export function brandedId<const B extends string>(brand: B) {
  return z.string().min(1).meta({ id: brand }).brand<B>();
}

/** A television's stable per-install id. The same value names it on the cast
 * roster and on a handoff beacon, so it belongs to neither and carries one
 * brand. The shape is what `valid_device_id` (kroma-primitives) demands of every
 * self-declared device id: 8-64 of `[A-Za-z0-9._-]`, narrow enough that a caller
 * cannot smuggle a path segment or a control character through one. */
export const DeviceId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/)
  .meta({ id: 'DeviceId' })
  .brand<'DeviceId'>();
export type DeviceId = z.infer<typeof DeviceId>;
