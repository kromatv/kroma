import { describe, expect, it } from 'vitest';
import { foldOpEvent, type OpModule, opPct, type StoreOp } from '#web/features/admin/module-ops';

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
});
