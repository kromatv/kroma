// Live `module.op.*` state: the store's install / update / uninstall progress
// frames folded into a map the UI renders as per-module progress bars. The
// fold is a pure reducer so it is testable without a socket. One module-level
// socket + state store is shared by every consumer (page, install dialog,
// detail drawer), so a late-mounting dialog still sees the frames that came
// before it and one tab holds one extra connection, not three.

import { KromaEvents, type MessageKey, type ServerEvent, type StoreOpEvent } from '@kroma/core';
import { useMemo, useSyncExternalStore } from 'react';
import { apiBase } from '#web/shared/lib/api';

export type OpPhase = 'wait' | 'download' | 'install' | 'done';

/** The i18n key for a phase's progress label. */
export const PHASE_KEY = {
  wait: 'admin.modulesPhaseWait',
  download: 'admin.modulesPhaseDownload',
  install: 'admin.modulesPhaseInstall',
  done: 'admin.modulesPhaseDone',
} as const satisfies Record<OpPhase, MessageKey>;

export interface OpModule {
  id: string;
  name?: string | null;
  version?: string | null;
  phase: OpPhase;
  received: number;
  total: number | null;
}

export interface StoreOp {
  op: string;
  kind: 'install' | 'update' | 'uninstall';
  requested: string;
  /** Module ids in plan order (extras discovered mid-op are appended). */
  order: string[];
  modules: Record<string, OpModule>;
  finished: boolean;
  ok: boolean | null;
  error: string | null;
}

function blank(id: string): OpModule {
  return { id, phase: 'wait', received: 0, total: null };
}

/** Fold one event into the op map. Unknown ops (progress for an op whose
 * `started` frame predates this subscription) are ignored; a new `started`
 * frame drops the finished ops, so the map stays bounded. */
export function foldOpEvent(
  ops: Record<string, StoreOp>,
  e: StoreOpEvent,
): Record<string, StoreOp> {
  switch (e.type) {
    case 'module.op.started': {
      const modules: Record<string, OpModule> = {};
      const order: string[] = [];
      for (const m of e.modules) {
        order.push(m.id);
        modules[m.id] = { ...blank(m.id), name: m.name, version: m.version, total: m.size ?? null };
      }
      const kept = Object.fromEntries(Object.entries(ops).filter(([, op]) => !op.finished));
      return {
        ...kept,
        [e.op]: {
          op: e.op,
          kind: e.kind,
          requested: e.requested,
          order,
          modules,
          finished: false,
          ok: null,
          error: null,
        },
      };
    }
    case 'module.op.progress': {
      const op = ops[e.op];
      if (!op) return ops;
      const prev = op.modules[e.id] ?? blank(e.id);
      const next: OpModule = {
        ...prev,
        phase: e.phase,
        received: e.received ?? prev.received,
        total: e.total ?? prev.total,
      };
      const order = op.modules[e.id] ? op.order : [...op.order, e.id];
      return { ...ops, [e.op]: { ...op, order, modules: { ...op.modules, [e.id]: next } } };
    }
    case 'module.op.done': {
      const op = ops[e.op];
      if (!op) return ops;
      const prev = op.modules[e.id] ?? blank(e.id);
      const next: OpModule = { ...prev, phase: 'done', version: e.version };
      const order = op.modules[e.id] ? op.order : [...op.order, e.id];
      return { ...ops, [e.op]: { ...op, order, modules: { ...op.modules, [e.id]: next } } };
    }
    case 'module.op.finished': {
      const op = ops[e.op];
      if (!op) return ops;
      return { ...ops, [e.op]: { ...op, finished: true, ok: e.ok, error: e.error ?? null } };
    }
    default:
      return ops;
  }
}

/** Percentage for a module's progress bar, or null while indeterminate. */
export function opPct(m: OpModule): number | null {
  if (m.phase === 'done') return 100;
  if (!m.total || m.total <= 0) return null;
  return Math.min(100, Math.round((m.received / m.total) * 100));
}

/** What a bar should show for a phase: real percent while downloading, full
 * while installing, empty while waiting. */
export function runningPct(phase: OpPhase, pct: number | null): number {
  if (phase === 'done') return 100;
  if (pct !== null) return pct;
  return phase === 'wait' ? 0 : 100;
}

let ops: Record<string, StoreOp> = {};
const listeners = new Set<() => void>();
let socket: KromaEvents<ServerEvent | StoreOpEvent> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!socket) {
    socket = new KromaEvents<ServerEvent | StoreOpEvent>(apiBase(), {
      onEvent: (e) => {
        if (!e.type.startsWith('module.op.')) return;
        ops = foldOpEvent(ops, e as StoreOpEvent);
        for (const l of listeners) l();
      },
    });
    socket.connect();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      socket?.close();
      socket = null;
    }
  };
}

export function useStoreOps(): {
  ops: Record<string, StoreOp>;
  /** The in-flight state of each module currently part of an unfinished op. */
  activeByModule: Map<string, OpModule & { op: string }>;
} {
  const snapshot = useSyncExternalStore(subscribe, () => ops);
  const activeByModule = useMemo(() => {
    const map = new Map<string, OpModule & { op: string }>();
    for (const op of Object.values(snapshot)) {
      if (op.finished) continue;
      for (const m of Object.values(op.modules)) {
        map.set(m.id, { ...m, op: op.op });
      }
    }
    return map;
  }, [snapshot]);
  return { ops: snapshot, activeByModule };
}
