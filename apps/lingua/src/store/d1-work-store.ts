import { confirm, edit, maybe, proposal, start } from './d1-records';
import type { Confirm, Edit, EditKey, Proposal, Start } from './store';

/** One prepared statement of a D1 database. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[] }>;
}

/** The subset of Cloudflare's D1 binding Lingua uses, declared here as the stats relay does. */
export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

const UPSERT_EDIT = `INSERT INTO edits (project, user_id, locale, file, key, value, proposed, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  ON CONFLICT (project, user_id, locale, key) DO UPDATE SET file = excluded.file,
    value = excluded.value, proposed = excluded.proposed, updated_at = excluded.updated_at`;

const UPSERT_PROPOSAL = `INSERT INTO proposals (project, user_id, locale, branch, pr_number, pr_url, head_sha, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  ON CONFLICT (project, user_id, locale) DO UPDATE SET branch = excluded.branch,
    pr_number = excluded.pr_number, pr_url = excluded.pr_url, head_sha = excluded.head_sha,
    updated_at = excluded.updated_at`;

const UPSERT_CONFIRM = `INSERT INTO confirms (project, user_id, locale, key, proposed, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT (project, user_id, locale, key) DO UPDATE SET proposed = excluded.proposed,
    updated_at = excluded.updated_at`;

const PENDING = ['edits', 'confirms', 'starts'] as const;

type EditKeyless = Omit<EditKey, 'key'>;

/** What each contributor has in hand in D1: their edits, confirms, started languages and pull requests. */
export class D1WorkStore {
  constructor(protected readonly db: D1Database) {}

  async edits(projectId: string, userId: number, locale: string): Promise<Edit[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM edits WHERE project = ?1 AND user_id = ?2 AND locale = ?3 ORDER BY file, key',
      )
      .bind(projectId, userId, locale)
      .all();
    return results.map(edit);
  }

  async putEdit(e: Edit): Promise<void> {
    await this.db
      .prepare(UPSERT_EDIT)
      .bind(e.project, e.userId, e.locale, e.file, e.key, e.value, e.proposed ? 1 : 0, e.updatedAt)
      .run();
  }

  async deleteEdit(which: EditKey): Promise<void> {
    await this.db
      .prepare('DELETE FROM edits WHERE project = ?1 AND user_id = ?2 AND locale = ?3 AND key = ?4')
      .bind(which.project, which.userId, which.locale, which.key)
      .run();
  }

  async confirms(projectId: string, userId: number, locale: string): Promise<Confirm[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM confirms WHERE project = ?1 AND user_id = ?2 AND locale = ?3 ORDER BY key',
      )
      .bind(projectId, userId, locale)
      .all();
    return results.map(confirm);
  }

  async putConfirm(c: Confirm): Promise<void> {
    await this.db
      .prepare(UPSERT_CONFIRM)
      .bind(c.project, c.userId, c.locale, c.key, c.proposed ? 1 : 0, c.updatedAt)
      .run();
  }

  async starts(projectId: string, userId: number): Promise<Start[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM starts WHERE project = ?1 AND user_id = ?2 ORDER BY locale')
      .bind(projectId, userId)
      .all();
    return results.map(start);
  }

  async putStart(s: Start): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO starts (project, user_id, locale, proposed, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (project, user_id, locale) DO UPDATE SET proposed = excluded.proposed`,
      )
      .bind(s.project, s.userId, s.locale, s.proposed ? 1 : 0, s.createdAt)
      .run();
  }

  private everyPending(sql: (table: string) => string, mine: EditKeyless): D1Statement[] {
    return PENDING.map((table) =>
      this.db.prepare(sql(table)).bind(mine.project, mine.userId, mine.locale),
    );
  }

  async dropUnsent(projectId: string, userId: number, locale: string): Promise<void> {
    const mine = { project: projectId, userId, locale };
    await this.db.batch(
      this.everyPending(
        (table) =>
          `DELETE FROM ${table} WHERE project = ?1 AND user_id = ?2 AND locale = ?3 AND proposed = 0`,
        mine,
      ),
    );
  }

  async markProposed(projectId: string, userId: number, locale: string): Promise<void> {
    const mine = { project: projectId, userId, locale };
    await this.db.batch(
      this.everyPending(
        (table) =>
          `UPDATE ${table} SET proposed = 1 WHERE project = ?1 AND user_id = ?2 AND locale = ?3`,
        mine,
      ),
    );
  }

  async proposal(projectId: string, userId: number, locale: string): Promise<Proposal | null> {
    const row = await this.db
      .prepare('SELECT * FROM proposals WHERE project = ?1 AND user_id = ?2 AND locale = ?3')
      .bind(projectId, userId, locale)
      .first();
    return maybe(row, proposal);
  }

  async proposalsOf(projectId: string): Promise<Proposal[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM proposals WHERE project = ?1 ORDER BY updated_at')
      .bind(projectId)
      .all();
    return results.map(proposal);
  }

  async saveProposal(p: Proposal): Promise<void> {
    await this.db
      .prepare(UPSERT_PROPOSAL)
      .bind(p.project, p.userId, p.locale, p.branch, p.prNumber, p.prUrl, p.headSha, p.updatedAt)
      .run();
  }

  async closeProposal(p: Proposal): Promise<void> {
    const sent = this.everyPending(
      (table) =>
        `DELETE FROM ${table} WHERE project = ?1 AND user_id = ?2 AND locale = ?3 AND proposed = 1`,
      p,
    );
    await this.db.batch([
      ...sent,
      this.db
        .prepare('DELETE FROM proposals WHERE project = ?1 AND user_id = ?2 AND locale = ?3')
        .bind(p.project, p.userId, p.locale),
    ]);
  }
}
