import type { DownloadId } from '@kromatv/client/watchable';
import { z } from 'zod';

const Stop = z.object({ id: z.string().min(1).max(200), sec: z.number().nonnegative() });
const Ledger = z.array(Stop);

type Stop = z.infer<typeof Stop>;

export const WATCH_RESUME_STORE_KEY = 'kroma.watchResume';

const KEPT = 24;
const LEAST_SEC = 30;
const ENDS_AT = 0.95;

export const watchResumeId = (downloadId: DownloadId, file: number): string =>
  `${downloadId}:${file}`;

function parse(raw: string | null): Stop[] {
  if (!raw) return [];
  try {
    const read = Ledger.safeParse(JSON.parse(raw));
    return read.success ? read.data.slice(0, KEPT) : [];
  } catch {
    return [];
  }
}

function resumableSeconds(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(positionSec) || positionSec < LEAST_SEC) return 0;
  if (durationSec > 0 && positionSec > durationSec * ENDS_AT) return 0;
  return positionSec;
}

/** Where `id` was left, or 0 for a file this device has never played to a
 * position worth keeping. */
export function watchResumeOf(raw: string | null, id: string): number {
  return parse(raw).find((stop) => stop.id === id)?.sec ?? 0;
}

/** The ledger to store after watching `id` up to `positionSec`. A position that
 * is not worth reopening at takes the file out rather than pinning it to the
 * start. */
export function watchResumeWith(
  raw: string | null,
  id: string,
  positionSec: number,
  durationSec: number,
): string {
  const kept = parse(raw).filter((stop) => stop.id !== id);
  const sec = resumableSeconds(positionSec, durationSec);
  const next = sec > 0 ? [{ id, sec }, ...kept] : kept;
  return JSON.stringify(next.slice(0, KEPT));
}
