// Every SQL statement the collector runs, behind one narrow interface so the
// routes and the rules can be tested against an in-memory stand-in.

import type { Ping } from './schemas';

export interface InstanceRow {
  id: string;
  firstSeen: number;
  lastSeen: number;
  version: string;
  target: string;
  install: string;
  country: string | null;
  clients: { tv: number; mobile: number; desktop: number };
  locales: string[];
  modules: string[];
  users: string;
  titles: string;
  flagged: boolean;
}

export interface DailyRow {
  day: string;
  instances: number;
  clients: number;
}

export interface Store {
  /** Write one heartbeat. `first_seen` is never moved by a later ping. */
  upsert(ping: Ping, country: string | null, now: number): Promise<void>;
  /** Whether this install already has a row. */
  has(id: string): Promise<boolean>;
  /** Every stored row. The published rules are applied in `aggregate`, not here. */
  all(): Promise<InstanceRow[]>;
  daily(): Promise<DailyRow[]>;
  flag(ids: string[]): Promise<void>;
  record(day: string, instances: number, clients: number): Promise<void>;
  /** Forget rows nobody has heard from since `before`. */
  prune(before: number): Promise<void>;
}

interface D1Result<T> {
  results: T[];
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<D1Result<T>>;
}

/** The subset of Cloudflare's D1 binding this Worker uses. Declared locally
 * rather than pulled from `@cloudflare/workers-types`, which this repo does not
 * install; same approach as the push relay's rate limiter. */
export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface StoredRow {
  id: string;
  first_seen: number;
  last_seen: number;
  version: string;
  target: string;
  install: string;
  country: string | null;
  clients_tv: number;
  clients_mobile: number;
  clients_desktop: number;
  locales: string;
  modules: string;
  users_bucket: string;
  titles_bucket: string;
  flagged: number;
}

function parseList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toRow(row: StoredRow): InstanceRow {
  return {
    id: row.id,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    version: row.version,
    target: row.target,
    install: row.install,
    country: row.country,
    clients: {
      tv: row.clients_tv,
      mobile: row.clients_mobile,
      desktop: row.clients_desktop,
    },
    locales: parseList(row.locales),
    modules: parseList(row.modules),
    users: row.users_bucket,
    titles: row.titles_bucket,
    flagged: row.flagged !== 0,
  };
}

const UPSERT = `INSERT INTO instances
  (id, first_seen, last_seen, version, commit_hash, target, install, country,
   clients_tv, clients_mobile, clients_desktop, locales, modules,
   users_bucket, titles_bucket, flagged)
  VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0)
  ON CONFLICT(id) DO UPDATE SET
    last_seen = excluded.last_seen,
    version = excluded.version,
    commit_hash = excluded.commit_hash,
    target = excluded.target,
    install = excluded.install,
    country = excluded.country,
    clients_tv = excluded.clients_tv,
    clients_mobile = excluded.clients_mobile,
    clients_desktop = excluded.clients_desktop,
    locales = excluded.locales,
    modules = excluded.modules,
    users_bucket = excluded.users_bucket,
    titles_bucket = excluded.titles_bucket`;

export function d1Store(db: D1Database): Store {
  return {
    async upsert(ping, country, now) {
      await db
        .prepare(UPSERT)
        .bind(
          ping.id,
          now,
          ping.version,
          ping.commit,
          ping.target,
          ping.install,
          country,
          ping.clients.tv,
          ping.clients.mobile,
          ping.clients.desktop,
          JSON.stringify(ping.locales),
          JSON.stringify(ping.modules),
          ping.users,
          ping.titles,
        )
        .run();
    },
    async has(id) {
      const { results } = await db
        .prepare('SELECT id FROM instances WHERE id = ?1')
        .bind(id)
        .all<{ id: string }>();
      return results.length > 0;
    },
    async all() {
      const { results } = await db
        .prepare(
          `SELECT id, first_seen, last_seen, version, target, install, country,
                  clients_tv, clients_mobile, clients_desktop, locales, modules,
                  users_bucket, titles_bucket, flagged
             FROM instances`,
        )
        .all<StoredRow>();
      return results.map(toRow);
    },
    async daily() {
      const { results } = await db
        .prepare('SELECT day, instances, clients FROM daily ORDER BY day')
        .all<DailyRow>();
      return results;
    },
    async flag(ids) {
      if (ids.length === 0) return;
      await db.batch(
        ids.map((id) => db.prepare('UPDATE instances SET flagged = 1 WHERE id = ?1').bind(id)),
      );
    },
    async record(day, instances, clients) {
      await db
        .prepare(
          `INSERT INTO daily (day, instances, clients) VALUES (?1, ?2, ?3)
             ON CONFLICT(day) DO UPDATE SET instances = excluded.instances, clients = excluded.clients`,
        )
        .bind(day, instances, clients)
        .run();
    },
    async prune(before) {
      await db.prepare('DELETE FROM instances WHERE last_seen < ?1').bind(before).run();
    },
  };
}
