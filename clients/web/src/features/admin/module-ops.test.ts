// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  foldOpEvent,
  type OpModule,
  opPct,
  runningPct,
  type StoreOp,
  useStoreOps,
} from '#web/features/admin/module-ops';

type SocketEvent = { type: string } & Record<string, unknown>;

const H = vi.hoisted(() => ({
  sockets: [] as Array<{
    onEvent: (e: SocketEvent) => void;
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  KromaEvents: class {
    connect = vi.fn();
    close = vi.fn();
    constructor(_base: string, opts: { onEvent: (e: SocketEvent) => void }) {
      H.sockets.push({ onEvent: opts.onEvent, connect: this.connect, close: this.close });
    }
  },
}));

vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'http://kroma.test' }));

afterEach(() => cleanup());

const started = {
  type: 'module.op.started' as const,
  op: 'op1',
  kind: 'install' as const,
  requested: 'tv.kroma.torrents',
  modules: [
    { id: 'tv.kroma.indexer', name: 'Indexers', version: '0.1.0', size: 1000 },
    { id: 'tv.kroma.torrents', name: 'Torrents', version: '0.1.5', size: 4000 },
  ],
};

function op(ops: Record<string, StoreOp>, id: string): StoreOp {
  const found = ops[id];
  if (!found) throw new Error(`missing op ${id}`);
  return found;
}

function mod(o: StoreOp, id: string): OpModule {
  const found = o.modules[id];
  if (!found) throw new Error(`missing module ${id}`);
  return found;
}

describe('foldOpEvent', () => {
  it('folds a full install lifecycle into per-module state', () => {
    let ops: Record<string, StoreOp> = {};
    ops = foldOpEvent(ops, started);
    expect(op(ops, 'op1').order).toEqual(['tv.kroma.indexer', 'tv.kroma.torrents']);
    expect(mod(op(ops, 'op1'), 'tv.kroma.indexer').phase).toBe('wait');
    expect(mod(op(ops, 'op1'), 'tv.kroma.indexer').total).toBe(1000);

    ops = foldOpEvent(ops, {
      type: 'module.op.progress',
      op: 'op1',
      id: 'tv.kroma.indexer',
      phase: 'download',
      received: 500,
      total: 1000,
    });
    expect(mod(op(ops, 'op1'), 'tv.kroma.indexer').phase).toBe('download');
    expect(opPct(mod(op(ops, 'op1'), 'tv.kroma.indexer'))).toBe(50);

    ops = foldOpEvent(ops, {
      type: 'module.op.progress',
      op: 'op1',
      id: 'tv.kroma.indexer',
      phase: 'install',
    });
    // Missing byte fields keep the last known counts.
    expect(mod(op(ops, 'op1'), 'tv.kroma.indexer').received).toBe(500);

    ops = foldOpEvent(ops, {
      type: 'module.op.done',
      op: 'op1',
      id: 'tv.kroma.indexer',
      version: '0.1.0',
    });
    expect(mod(op(ops, 'op1'), 'tv.kroma.indexer').phase).toBe('done');
    expect(opPct(mod(op(ops, 'op1'), 'tv.kroma.indexer'))).toBe(100);
    expect(op(ops, 'op1').finished).toBe(false);

    ops = foldOpEvent(ops, { type: 'module.op.finished', op: 'op1', ok: true });
    expect(op(ops, 'op1').finished).toBe(true);
    expect(op(ops, 'op1').ok).toBe(true);
  });

  it('appends a module the started frame did not list', () => {
    let ops = foldOpEvent({}, started);
    ops = foldOpEvent(ops, {
      type: 'module.op.progress',
      op: 'op1',
      id: 'tv.kroma.vpn',
      phase: 'download',
      received: 1,
      total: 10,
    });
    expect(op(ops, 'op1').order).toEqual(['tv.kroma.indexer', 'tv.kroma.torrents', 'tv.kroma.vpn']);
  });

  it('ignores frames for an op it never saw start and unknown types', () => {
    const ops = foldOpEvent(
      {},
      { type: 'module.op.progress', op: 'ghost', id: 'x', phase: 'download' },
    );
    expect(ops).toEqual({});
    const after = foldOpEvent({}, { type: 'module.changed', id: 'x', enabled: true });
    expect(after).toEqual({});
  });

  it('drops finished ops when a new one starts', () => {
    let ops = foldOpEvent({}, started);
    ops = foldOpEvent(ops, { type: 'module.op.finished', op: 'op1', ok: true });
    ops = foldOpEvent(ops, { ...started, op: 'op2' });
    expect(Object.keys(ops)).toEqual(['op2']);
  });

  it('reports an indeterminate pct without a total', () => {
    let ops = foldOpEvent({}, started);
    ops = foldOpEvent(ops, {
      type: 'module.op.progress',
      op: 'op1',
      id: 'tv.kroma.vpn',
      phase: 'download',
      received: 5,
    });
    expect(opPct(mod(op(ops, 'op1'), 'tv.kroma.vpn'))).toBeNull();
  });

  it('ignores a done or finished frame for an op it never saw start', () => {
    expect(
      foldOpEvent({}, { type: 'module.op.done', op: 'ghost', id: 'x', version: '1.0.0' }),
    ).toEqual({});
    expect(foldOpEvent({}, { type: 'module.op.finished', op: 'ghost', ok: false })).toEqual({});
  });

  it('appends a module it first hears of in a done frame', () => {
    let ops = foldOpEvent({}, started);
    ops = foldOpEvent(ops, {
      type: 'module.op.done',
      op: 'op1',
      id: 'tv.kroma.vpn',
      version: '2.0.0',
    });
    expect(op(ops, 'op1').order).toEqual(['tv.kroma.indexer', 'tv.kroma.torrents', 'tv.kroma.vpn']);
    expect(mod(op(ops, 'op1'), 'tv.kroma.vpn')).toMatchObject({ phase: 'done', version: '2.0.0' });
  });

  it('leaves a module the registry gave no size for indeterminate', () => {
    const ops = foldOpEvent(
      {},
      {
        ...started,
        modules: [{ id: 'tv.kroma.notes', name: 'Notes', version: '0.1.0' }],
      },
    );
    expect(mod(op(ops, 'op1'), 'tv.kroma.notes').total).toBeNull();
  });

  it('keeps the error a failed op finished with', () => {
    let ops = foldOpEvent({}, started);
    ops = foldOpEvent(ops, {
      type: 'module.op.finished',
      op: 'op1',
      ok: false,
      error: 'checksum mismatch',
    });
    expect(op(ops, 'op1')).toMatchObject({ finished: true, ok: false, error: 'checksum mismatch' });
  });
});

describe('runningPct', () => {
  it('fills the bar for done and install, empties it while waiting', () => {
    expect(runningPct('done', null)).toBe(100);
    expect(runningPct('done', 12)).toBe(100);
    expect(runningPct('download', 42)).toBe(42);
    expect(runningPct('wait', null)).toBe(0);
    expect(runningPct('install', null)).toBe(100);
  });
});

describe('useStoreOps', () => {
  it('shares one socket across consumers and closes it with the last of them', () => {
    const page = renderHook(() => useStoreOps());
    const dialog = renderHook(() => useStoreOps());
    expect(H.sockets).toHaveLength(1);
    const socket = H.sockets[0];
    expect(socket?.connect).toHaveBeenCalledTimes(1);

    act(() => socket?.onEvent({ type: 'library.changed' }));
    expect(page.result.current.ops).toEqual({});

    act(() => socket?.onEvent({ ...started, op: 'live' }));
    expect(dialog.result.current.ops).toBe(page.result.current.ops);
    expect(page.result.current.activeByModule.get('tv.kroma.indexer')).toMatchObject({
      op: 'live',
      phase: 'wait',
    });

    act(() => socket?.onEvent({ type: 'module.op.finished', op: 'live', ok: true }));
    expect(page.result.current.activeByModule.size).toBe(0);

    page.unmount();
    expect(socket?.close).not.toHaveBeenCalled();
    dialog.unmount();
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });
});
