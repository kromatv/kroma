import type { Ping } from './schemas';
import type { DailyRow, InstanceRow, Store } from './store';

export function ping(overrides: Partial<Ping> = {}): Ping {
  return {
    schema: 1,
    id: 'a'.repeat(64),
    version: '1.4.2',
    commit: 'cafed00d',
    target: 'aarch64-apple-darwin',
    install: 'docker',
    clients: { tv: 1, mobile: 2, desktop: 0 },
    locales: ['fr-ch'],
    modules: ['tv.kroma.torrents'],
    users: '2-5',
    titles: '1k-4999',
    ...overrides,
  };
}

export function row(overrides: Partial<InstanceRow> = {}): InstanceRow {
  return {
    id: 'a'.repeat(64),
    firstSeen: 0,
    lastSeen: 0,
    version: '1.4.2',
    target: 'aarch64-apple-darwin',
    install: 'docker',
    country: 'CH',
    clients: { tv: 1, mobile: 2, desktop: 0 },
    locales: ['fr-ch'],
    modules: ['tv.kroma.torrents'],
    users: '2-5',
    titles: '1k-4999',
    flagged: false,
    ...overrides,
  };
}

/** A `Store` that keeps its rows in a Map, so the routes and the rules are
 * tested against real behaviour without a database. */
export function memoryStore(seed: InstanceRow[] = []): Store & { rows: Map<string, InstanceRow> } {
  const rows = new Map(seed.map((r) => [r.id, r]));
  const days = new Map<string, DailyRow>();
  return {
    rows,
    async upsert(p, country, now) {
      const existing = rows.get(p.id);
      rows.set(p.id, {
        id: p.id,
        firstSeen: existing?.firstSeen ?? now,
        lastSeen: now,
        version: p.version,
        target: p.target,
        install: p.install,
        country,
        clients: p.clients,
        locales: [...p.locales],
        modules: [...p.modules],
        users: p.users,
        titles: p.titles,
        flagged: existing?.flagged ?? false,
      });
    },
    async has(id) {
      return rows.has(id);
    },
    async all() {
      return [...rows.values()];
    },
    async daily() {
      return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    },
    async flag(ids) {
      for (const id of ids) {
        const found = rows.get(id);
        if (found) rows.set(id, { ...found, flagged: true });
      }
    },
    async record(day, instances, clients) {
      days.set(day, { day, instances, clients });
    },
    async prune(before) {
      for (const [id, r] of rows) if (r.lastSeen < before) rows.delete(id);
    },
    async forget(id) {
      rows.delete(id);
    },
  };
}

export function allow() {
  return { limit: async () => ({ success: true }) };
}

export function deny() {
  return { limit: async () => ({ success: false }) };
}
