// @vitest-environment jsdom

import type { KromaClient, MediaItem } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: vi.fn(async () => undefined),
  readAsStringAsync: vi.fn(async () => '[]'),
  writeAsStringAsync: vi.fn(async () => undefined),
  readDirectoryAsync: vi.fn(async (): Promise<string[]> => []),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async () => undefined),
  downloadAsync: vi.fn(async () => ({})),
}));
vi.mock('expo-file-system/legacy', () => fs);

const downloader = vi.hoisted(() => ({
  setConfig: vi.fn(),
  getExistingDownloadTasks: vi.fn<() => Promise<unknown[]>>(),
  createDownloadTask: vi.fn(),
  completeHandler: vi.fn(),
}));
vi.mock('@kesha-antonov/react-native-background-downloader', () => downloader);

const network = vi.hoisted(() => ({
  listener: null as ((state: { isConnected: boolean }) => void) | null,
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: (fn: (state: { isConnected: boolean }) => void) => {
    network.listener = fn;
    return {
      remove: () => {
        network.listener = null;
      },
    };
  },
}));

const translate = vi.hoisted(() => (key: string) => key);
vi.mock('#mobile/lib/i18n', () => ({ useT: () => translate }));

const alert = vi.hoisted(() => vi.fn());
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Alert: { alert },
}));

const store = vi.hoisted(() => ({
  readIndex: vi.fn<() => Promise<unknown[]>>(),
  readWanted: vi.fn<() => Promise<unknown[]>>(),
  writeIndex: vi.fn(async () => undefined),
  writeWanted: vi.fn(async () => undefined),
  sweepOrphans: vi.fn(async () => undefined),
  deleteEntryFiles: vi.fn(async () => undefined),
}));
vi.mock('./store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...store,
}));

const transfer = vi.hoisted(() => ({
  runTransfer: vi.fn<(client: unknown, item: unknown, hooks: unknown) => Promise<unknown>>(),
  adoptTransfer:
    vi.fn<(client: unknown, task: unknown, meta: unknown, hooks: unknown) => Promise<unknown>>(),
  transferMetaOf: vi.fn<(task: unknown) => unknown>(),
}));
vi.mock('./transfer', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...transfer,
}));

import { DownloadsProvider, useDownloads } from './index';
import type { DownloadEntry } from './store';
import { CANCELLED, type TransferHooks, TransferInterrupted } from './transfer';

interface Pending {
  hooks: TransferHooks;
  settle: (entry: DownloadEntry) => void;
  fail: (err: unknown) => void;
}

const pending = new Map<string, Pending>();

const park = (id: string, hooks: TransferHooks) =>
  new Promise<DownloadEntry>((settle, fail) => {
    pending.set(id, { hooks, settle, fail });
  });

const media = (id: string): MediaItem =>
  ({
    id,
    title: id,
    metadata: { title: id },
    container: 'mkv',
    files: [{ id: `${id}_file`, size: 1024 }],
  }) as unknown as MediaItem;

const entryFor = (id: string): DownloadEntry =>
  ({
    itemId: id,
    item: media(id),
    fileUri: `file:///docs/${id}.mp4`,
    sizeBytes: 1024,
  }) as unknown as DownloadEntry;

const platformTask = (id: string, state: string, downloaded: number, total: number) => ({
  id,
  state,
  bytesDownloaded: downloaded,
  bytesTotal: total,
  stop: vi.fn(async () => undefined),
  metadata: {},
});

const handleSpy = () => ({
  cancel: vi.fn<() => void>(),
  pause: vi.fn<() => void>(),
  resume: vi.fn<() => void>(),
});

const session = { client: {} as KromaClient | null };

const wrapper = ({ children }: { children: ReactNode }) => (
  <DownloadsProvider client={session.client}>{children}</DownloadsProvider>
);

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

async function mounted() {
  const view = renderHook(() => useDownloads(), { wrapper });
  await flush();
  await flush();
  return view;
}

const ids = (items: MediaItem[]) => items.map((item) => item.id);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pending.clear();
  session.client = {} as KromaClient;
  network.listener = null;
  store.readIndex.mockResolvedValue([]);
  store.readWanted.mockResolvedValue([]);
  downloader.getExistingDownloadTasks.mockResolvedValue([]);
  transfer.transferMetaOf.mockReturnValue(null);
  transfer.runTransfer.mockImplementation((_client, item, hooks) =>
    park((item as MediaItem).id, hooks as TransferHooks),
  );
  transfer.adoptTransfer.mockImplementation((_client, _task, meta, hooks) =>
    park((meta as { item: MediaItem }).item.id, hooks as TransferHooks),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the download queue', () => {
  it('runs one title and parks the rest', async () => {
    const view = await mounted();

    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
      view.result.current.start(media('c'));
    });

    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
    expect(ids(view.result.current.queuedItems)).toEqual(['b', 'c']);
  });

  it('is one shorter every time a transfer settles', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
      view.result.current.start(media('c'));
    });

    await act(async () => {
      pending.get('a')?.settle(entryFor('a'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(ids(view.result.current.queuedItems)).toEqual(['c']);
    expect(view.result.current.stateFor('b')).toEqual({ status: 'downloading', progress: 0 });
    expect(view.result.current.stateFor('a')).toEqual({
      status: 'done',
      entry: expect.objectContaining({ itemId: 'a' }),
    });
  });

  it('drains to empty rather than spinning when every title has run', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });

    await act(async () => {
      pending.get('a')?.settle(entryFor('a'));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      pending.get('b')?.settle(entryFor('b'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(view.result.current.queuedItems).toEqual([]);
    expect(transfer.runTransfer).toHaveBeenCalledTimes(2);
    expect(ids(view.result.current.entries.map((e) => e.item))).toEqual(['a', 'b']);
  });

  it('never runs one title twice, however often it is started', async () => {
    const view = await mounted();

    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('a'));
      view.result.current.start(media('a'));
    });

    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
    expect(view.result.current.queuedItems).toEqual([]);
  });

  it('refuses a title already in the index', async () => {
    store.readIndex.mockResolvedValue([entryFor('a')]);
    const view = await mounted();

    act(() => view.result.current.start(media('a')));

    expect(transfer.runTransfer).not.toHaveBeenCalled();
  });
});

describe('a transfer the platform kept alive', () => {
  it('is adopted rather than started again from the wanted list', async () => {
    downloader.getExistingDownloadTasks.mockResolvedValue([
      platformTask('a', 'DOWNLOADING', 50, 100),
    ]);
    transfer.transferMetaOf.mockReturnValue({
      item: media('a'),
      fileUri: 'file:///docs/a.mp4',
      raw: true,
      estimatedTotal: 100,
    });
    store.readWanted.mockResolvedValue([media('a')]);

    const view = await mounted();

    expect(transfer.adoptTransfer).toHaveBeenCalledTimes(1);
    expect(transfer.runTransfer).not.toHaveBeenCalled();
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0.5 });
  });

  it('is adopted once even when the platform reports it twice', async () => {
    downloader.getExistingDownloadTasks.mockResolvedValue([
      platformTask('a', 'DOWNLOADING', 10, 100),
      platformTask('a', 'DOWNLOADING', 60, 100),
    ]);
    transfer.transferMetaOf.mockReturnValue({
      item: media('a'),
      fileUri: 'file:///docs/a.mp4',
      raw: true,
      estimatedTotal: 100,
    });

    const view = await mounted();

    expect(transfer.adoptTransfer).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0.1 });
  });

  it('leaves a title the platform lost to the wanted list', async () => {
    store.readWanted.mockResolvedValue([media('a')]);

    const view = await mounted();

    expect(transfer.adoptTransfer).not.toHaveBeenCalled();
    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
  });
});

describe('pausing', () => {
  it('parks the transfer without freeing the running slot', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });
    const handle = handleSpy();
    act(() => void pending.get('a')?.hooks.onTask(handle));

    act(() => view.result.current.pause('a'));
    await flush();

    expect(handle.pause).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'paused', progress: 0 });
    expect(view.result.current.stateFor('b')).toEqual({ status: 'queued' });
    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
  });

  it('resumes the same transfer instead of starting a second one', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));
    const handle = handleSpy();
    act(() => void pending.get('a')?.hooks.onTask(handle));
    act(() => view.result.current.pause('a'));

    act(() => view.result.current.resume('a'));
    await flush();

    expect(handle.resume).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
  });
});

describe('cancelling', () => {
  it('drops a queued title and leaves the running one alone', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });

    act(() => view.result.current.cancel('b'));

    expect(view.result.current.stateFor('b')).toEqual({ status: 'none' });
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
  });

  it('is honoured by a transfer that only later gets a handle', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));

    act(() => view.result.current.cancel('a'));

    const handle = handleSpy();
    expect(pending.get('a')?.hooks.onTask(handle)).toBe(false);
    expect(handle.cancel).not.toHaveBeenCalled();
  });

  it('is consumed once, so the next attempt at the same title survives', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));
    act(() => view.result.current.cancel('a'));
    pending.get('a')?.hooks.onTask(handleSpy());

    await act(async () => {
      pending.get('a')?.fail(new Error(CANCELLED));
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => view.result.current.start(media('a')));

    expect(pending.get('a')?.hooks.onTask(handleSpy())).toBe(true);
    expect(transfer.runTransfer).toHaveBeenCalledTimes(2);
  });

  it('leaves nothing behind and alerts nobody', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });
    const handle = handleSpy();
    act(() => void pending.get('a')?.hooks.onTask(handle));

    act(() => view.result.current.cancel('a'));
    await act(async () => {
      pending.get('a')?.fail(new Error(CANCELLED));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(view.result.current.entries).toEqual([]);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'none' });
    expect(view.result.current.stateFor('b')).toEqual({ status: 'downloading', progress: 0 });
  });
});

describe('an interrupted transfer', () => {
  it('goes back to the head of the queue without alerting', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });

    await act(async () => {
      pending.get('a')?.fail(new TransferInterrupted('the tunnel died'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(alert).not.toHaveBeenCalled();
    expect(ids(view.result.current.queuedItems)).toEqual(['a', 'b']);
    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
  });

  it('restarts when the backoff timer fires', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));
    await act(async () => {
      pending.get('a')?.fail(new TransferInterrupted('the tunnel died'));
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));

    expect(transfer.runTransfer).toHaveBeenCalledTimes(2);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
  });

  it('restarts as soon as the network comes back', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));
    await act(async () => {
      pending.get('a')?.fail(new TransferInterrupted('the tunnel died'));
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      network.listener?.({ isConnected: true });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(transfer.runTransfer).toHaveBeenCalledTimes(2);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'downloading', progress: 0 });
  });

  it('drops its retry timer when the provider unmounts', async () => {
    const view = await mounted();
    act(() => view.result.current.start(media('a')));
    await act(async () => {
      pending.get('a')?.fail(new TransferInterrupted('the tunnel died'));
      await vi.advanceTimersByTimeAsync(0);
    });

    view.unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));

    expect(transfer.runTransfer).toHaveBeenCalledTimes(1);
  });
});

describe('a failed transfer', () => {
  it('alerts the viewer and hands the slot to the next title', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });

    await act(async () => {
      pending.get('a')?.fail(new Error('not a media response: text/html'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(view.result.current.stateFor('a')).toEqual({ status: 'none' });
    expect(view.result.current.stateFor('b')).toEqual({ status: 'downloading', progress: 0 });
    expect(view.result.current.queuedItems).toEqual([]);
  });
});

describe('signing out', () => {
  it('keeps the queue instead of draining it on the next pump', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
      view.result.current.start(media('c'));
    });

    session.client = null;
    act(() => view.rerender());
    await act(async () => {
      pending.get('a')?.settle(entryFor('a'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(ids(view.result.current.queuedItems)).toEqual(['b', 'c']);
  });

  it('picks the queue back up when the session returns', async () => {
    const view = await mounted();
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });
    session.client = null;
    act(() => view.rerender());
    await act(async () => {
      pending.get('a')?.settle(entryFor('a'));
      await vi.advanceTimersByTimeAsync(0);
    });

    session.client = {} as KromaClient;
    act(() => view.rerender());
    await flush();

    expect(transfer.runTransfer.mock.calls.map((call) => (call[1] as MediaItem).id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('a title adopted while it is still queued', () => {
  it('leaves the queue instead of downloading a second time', async () => {
    downloader.getExistingDownloadTasks.mockResolvedValue([
      platformTask('b', 'DOWNLOADING', 10, 100),
    ]);
    transfer.transferMetaOf.mockReturnValue({
      item: media('b'),
      fileUri: 'file:///docs/b.mp4',
      raw: true,
      estimatedTotal: 100,
    });

    const view = renderHook(() => useDownloads(), { wrapper });
    act(() => {
      view.result.current.start(media('a'));
      view.result.current.start(media('b'));
    });
    await flush();
    await flush();

    await act(async () => {
      pending.get('b')?.settle(entryFor('b'));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      pending.get('a')?.settle(entryFor('a'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(transfer.adoptTransfer).toHaveBeenCalledTimes(1);
    expect(transfer.runTransfer.mock.calls.map((call) => (call[1] as MediaItem).id)).toEqual(['a']);
    expect(view.result.current.queuedItems).toEqual([]);
  });
});
