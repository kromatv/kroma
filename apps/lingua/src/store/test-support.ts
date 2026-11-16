import type { D1Database, D1Statement } from './d1-work-store';

/** One statement a fake D1 ran: its SQL and the values bound to it. */
export interface Ran {
  sql: string;
  values: unknown[];
}

/** What a fake D1 answers a read with, from the statement's SQL and values. */
export type Rows = (sql: string, values: readonly unknown[]) => unknown[];

/** A D1 database that answers reads with `rows`, records every statement it ran in order, and the size of each batch. */
export interface FakeD1 extends D1Database {
  ran: Ran[];
  batches: number[];
}

/** A fake D1 database, empty unless `rows` answers. */
export function fakeD1(rows: Rows = () => []): FakeD1 {
  const ran: Ran[] = [];
  const statement = (sql: string, values: unknown[]): D1Statement => {
    const read = () => {
      ran.push({ sql, values });
      return rows(sql, values);
    };
    return {
      bind: (...bound) => statement(sql, bound),
      run: async () => {
        read();
        return {};
      },
      first: async () => read()[0] ?? null,
      all: async () => ({ results: read() }),
    };
  };
  const db: FakeD1 = {
    ran,
    batches: [],
    prepare: (sql) => statement(sql, []),
    async batch(statements) {
      db.batches.push(statements.length);
      return Promise.all(statements.map((s) => s.run()));
    },
  };
  return db;
}
