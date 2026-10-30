import { KromaApiError, KromaSchemaError } from '@kromatv/client';
import type { ItemId, ProgressEntry } from '@kromatv/client/media';
import { belongsTo, PendingProgress, type ProgressAccount, progressKey } from './pending';
import { shouldReplay } from './replay';

/** Where pending entries outlive the process. `read` hands back whatever was
 *  stored, unparsed: the queue is the trust boundary, not the adapter. */
export interface PendingProgressStore {
  read(): Promise<unknown>;
  write(entries: PendingProgress[]): Promise<void>;
}

/** The server half of a replay, which is one account's `client.playback`. */
export interface ProgressTarget {
  current(itemId: ItemId): Promise<ProgressEntry | null>;
  save(itemId: ItemId, positionMs: number, durationMs: number | null): Promise<unknown>;
}

/** What one replay pass did. `kept` entries are still queued: the server could
 *  not be reached, so the caller backs off and comes again. */
export interface ReplayReport {
  saved: number;
  dropped: number;
  kept: number;
}

/**
 * One entry per account, server and title, holding the latest position only.
 * `remember` replaces what a title was holding, `settle` drops it for a position
 * the server has just taken, and `replay` sends an account's entries oldest
 * capture first, stopping at the first the server could not be reached for so a
 * dead link costs one call. An entry is spent when the server answers, even to
 * refuse it, and kept only when the server could not be reached: a dropped link,
 * a 5xx, or a 401, 408 or 429. Every call runs after the one before it, so two
 * players and a replay pass cannot write over each other.
 */
export interface ProgressQueue {
  remember(position: Omit<PendingProgress, 'attempts'>): Promise<void>;
  settle(item: ProgressAccount & { itemId: string }): Promise<void>;
  pending(): Promise<PendingProgress[]>;
  replay(account: ProgressAccount, target: ProgressTarget): Promise<ReplayReport>;
}

function usable(stored: unknown): PendingProgress[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((raw) => {
    const entry = PendingProgress.safeParse(raw);
    return entry.success ? [entry.data] : [];
  });
}

export function createProgressQueue(store: PendingProgressStore): ProgressQueue {
  let settled: Promise<unknown> = Promise.resolve();

  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const next = settled.then(work, work);
    settled = next.catch(() => undefined);
    return next;
  };

  const load = async (): Promise<PendingProgress[]> => usable(await store.read());

  const replace = async (
    change: (entries: PendingProgress[]) => PendingProgress[],
  ): Promise<void> => {
    await store.write(change(await load()));
  };

  const without = (entries: PendingProgress[], key: string): PendingProgress[] =>
    entries.filter((entry) => progressKey(entry) !== key);

  return {
    remember: (position) =>
      serially(() =>
        replace((entries) => [
          ...without(entries, progressKey(position)),
          { ...position, attempts: 0 },
        ]),
      ),

    settle: (item) => serially(() => replace((entries) => without(entries, progressKey(item)))),

    pending: () => serially(load),

    replay: (account, target) =>
      serially(async () => {
        const report: ReplayReport = { saved: 0, dropped: 0, kept: 0 };
        const entries = await load();
        const mine = entries
          .filter((entry) => belongsTo(entry, account))
          .sort((a, b) => a.capturedAt - b.capturedAt);
        const outcome = new Map<string, PendingProgress | null>();
        await walk(mine, target, report, outcome);
        await replace((current) =>
          current.flatMap((entry) => {
            const key = progressKey(entry);
            if (!outcome.has(key)) return [entry];
            const kept = outcome.get(key);
            return kept ? [kept] : [];
          }),
        );
        return report;
      }),
  };
}

type Verdict = 'saved' | 'dropped' | 'unreachable';

async function walk(
  queue: readonly PendingProgress[],
  target: ProgressTarget,
  report: ReplayReport,
  outcome: Map<string, PendingProgress | null>,
): Promise<void> {
  const [entry, ...rest] = queue;
  if (!entry) return;
  const verdict = await attempt(entry, target);
  if (verdict === 'unreachable') {
    outcome.set(progressKey(entry), { ...entry, attempts: entry.attempts + 1 });
    report.kept += 1 + rest.length;
    return;
  }
  report[verdict] += 1;
  outcome.set(progressKey(entry), null);
  return walk(rest, target, report, outcome);
}

async function attempt(entry: PendingProgress, target: ProgressTarget): Promise<Verdict> {
  try {
    if (!shouldReplay(entry, await target.current(entry.itemId))) return 'dropped';
    await target.save(entry.itemId, entry.positionMs, entry.durationMs);
    return 'saved';
  } catch (error) {
    return answered(error) ? 'dropped' : 'unreachable';
  }
}

const WORTH_ANOTHER_PASS = new Set([401, 408, 429]);

function answered(error: unknown): boolean {
  if (error instanceof KromaSchemaError) return true;
  if (!(error instanceof KromaApiError)) return false;
  return error.status >= 400 && error.status < 500 && !WORTH_ANOTHER_PASS.has(error.status);
}
