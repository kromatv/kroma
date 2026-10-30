import { KromaApiError, KromaSchemaError } from '@kromatv/client';
import type { ItemId, ProgressEntry } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import type { PendingProgress, ProgressAccount } from './pending';
import { createProgressQueue, type PendingProgressStore, type ProgressTarget } from './queue';

const ACCOUNT: ProgressAccount = { serverUrl: 'https://kroma.test', userId: 'usr-1' };
const CAPTURED_AT = Date.parse('2026-03-01T12:00:00.000Z');

function memoryStore(seed: unknown = []): PendingProgressStore & { held: unknown } {
  return {
    held: seed,
    async read() {
      return this.held;
    },
    async write(entries) {
      this.held = entries;
    },
  };
}

function position(over: Partial<Omit<PendingProgress, 'attempts'>> = {}) {
  return {
    ...ACCOUNT,
    itemId: 'itm-1' as ItemId,
    positionMs: 600_000,
    durationMs: 3_600_000,
    reachedEnd: false,
    capturedAt: CAPTURED_AT,
    ...over,
  };
}

function server(
  over: Partial<ProgressTarget> = {},
): ProgressTarget & { saved: [string, number][] } {
  const saved: [string, number][] = [];
  return {
    saved,
    current: async () => null,
    save: async (itemId, positionMs) => {
      saved.push([itemId, positionMs]);
    },
    ...over,
  };
}

const UNREACHABLE = () => {
  throw new TypeError('network request failed');
};

describe('remembering a position the server refused', () => {
  it('keeps one entry per title, holding the latest position', async () => {
    const store = memoryStore();
    const queue = createProgressQueue(store);

    await queue.remember(position({ positionMs: 100 }));
    await queue.remember(position({ positionMs: 900 }));

    const pending = await queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.positionMs).toBe(900);
  });

  it('keeps the same title apart for two accounts on one device', async () => {
    const queue = createProgressQueue(memoryStore());

    await queue.remember(position());
    await queue.remember(position({ userId: 'usr-2' }));

    expect(await queue.pending()).toHaveLength(2);
  });

  it('reads a stored blob it cannot parse as nothing queued', async () => {
    const queue = createProgressQueue(memoryStore([{ itemId: 'itm-1' }, 'rubbish']));

    expect(await queue.pending()).toEqual([]);
  });
});

describe('replaying what is queued', () => {
  it('sends the entry and forgets it only once the server has taken it', async () => {
    const queue = createProgressQueue(memoryStore());
    const target = server();
    await queue.remember(position());

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 1, dropped: 0, kept: 0 });
    expect(target.saved).toEqual([['itm-1', 600_000]]);
    expect(await queue.pending()).toEqual([]);
  });

  it('keeps an entry the server never confirmed, and counts the attempt', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());

    const report = await queue.replay(ACCOUNT, server({ save: UNREACHABLE }));

    expect(report).toEqual({ saved: 0, dropped: 0, kept: 1 });
    expect((await queue.pending())[0]?.attempts).toBe(1);
  });

  it('drops an entry another device has overtaken', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());
    const elsewhere: ProgressEntry = {
      itemId: 'itm-1' as ItemId,
      positionMs: 2_000_000,
      durationMs: 3_600_000,
      updatedAt: new Date(CAPTURED_AT + 3_600_000).toISOString(),
    };
    const target = server({ current: async () => elsewhere });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 0, dropped: 1, kept: 0 });
    expect(target.saved).toEqual([]);
    expect(await queue.pending()).toEqual([]);
  });

  it('drops a title the server refuses for good, and sends the ones behind it', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position({ itemId: 'gone' as ItemId, capturedAt: CAPTURED_AT }));
    await queue.remember(position({ itemId: 'itm-2' as ItemId, capturedAt: CAPTURED_AT + 1 }));
    const reached: string[] = [];
    const target = server({
      save: async (itemId) => {
        if (itemId === 'gone') throw new KromaApiError(404, 'PUT /progress/gone failed (404)');
        reached.push(itemId);
      },
    });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 1, dropped: 1, kept: 0 });
    expect(reached).toEqual(['itm-2']);
    expect(await queue.pending()).toEqual([]);
  });

  it('keeps a title the server failed on, because a later pass may get through', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position({ itemId: 'itm-1' as ItemId, capturedAt: CAPTURED_AT }));
    await queue.remember(position({ itemId: 'itm-2' as ItemId, capturedAt: CAPTURED_AT + 1 }));
    const target = server({
      save: async () => {
        throw new KromaApiError(503, 'PUT /progress/itm-1 failed (503)');
      },
    });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 0, dropped: 0, kept: 2 });
    expect(await queue.pending()).toHaveLength(2);
  });

  it('spends an entry on an answer this build cannot read', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());
    const target = server({
      save: async () => {
        throw new KromaSchemaError('PUT /progress/itm-1', []);
      },
    });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 0, dropped: 1, kept: 0 });
    expect(await queue.pending()).toEqual([]);
  });

  it('keeps an entry past a credential the server asked to be refreshed', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());
    const target = server({
      save: async () => {
        throw new KromaApiError(401, 'PUT /progress/itm-1 failed (401)');
      },
    });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 0, dropped: 0, kept: 1 });
    expect((await queue.pending())[0]?.attempts).toBe(1);
  });

  it('stops at the first title the server could not be reached for', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position({ itemId: 'itm-1' as ItemId, capturedAt: CAPTURED_AT }));
    await queue.remember(position({ itemId: 'itm-2' as ItemId, capturedAt: CAPTURED_AT + 1 }));
    const target = server({ current: UNREACHABLE });

    const report = await queue.replay(ACCOUNT, target);

    expect(report).toEqual({ saved: 0, dropped: 0, kept: 2 });
    expect(await queue.pending()).toHaveLength(2);
  });

  it('leaves the entries of another account where they are', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());
    await queue.remember(position({ userId: 'usr-2' }));

    await queue.replay(ACCOUNT, server());

    const left = await queue.pending();
    expect(left).toHaveLength(1);
    expect(left[0]?.userId).toBe('usr-2');
  });

  it('forgets an entry a live save has already settled', async () => {
    const queue = createProgressQueue(memoryStore());
    await queue.remember(position());

    await queue.settle({ ...ACCOUNT, itemId: 'itm-1' });

    expect(await queue.pending()).toEqual([]);
  });
});
