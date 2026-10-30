import { ItemId } from '@kromatv/client/media';
import { z } from 'zod';

/**
 * One position a client could not save, kept until the server takes it.
 *
 * `capturedAt` is the client's own clock at the moment the position was read,
 * which is what [`shouldReplay`](./replay) weighs against the server's stamp.
 * `reachedEnd` says the playback ran to the end of the file, which is a fact
 * about this device and not the account's watched verdict: that one stays the
 * server's, applied when the save lands.
 */
export const PendingProgress = z.object({
  serverUrl: z.string().min(1),
  userId: z.string().min(1),
  itemId: ItemId,
  positionMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive().nullable(),
  reachedEnd: z.boolean(),
  capturedAt: z.number().int().positive(),
  attempts: z.number().int().nonnegative(),
});
export type PendingProgress = z.infer<typeof PendingProgress>;

/** Who an entry belongs to, which is also what a replay pass is scoped to. */
export interface ProgressAccount {
  serverUrl: string;
  userId: string;
}

/** One entry per account, server and item, so a later position REPLACES an
 *  earlier one rather than queueing behind it. */
export function progressKey(entry: ProgressAccount & { itemId: string }): string {
  return JSON.stringify([entry.serverUrl, entry.userId, entry.itemId]);
}

export function belongsTo(entry: PendingProgress, account: ProgressAccount): boolean {
  return entry.serverUrl === account.serverUrl && entry.userId === account.userId;
}
