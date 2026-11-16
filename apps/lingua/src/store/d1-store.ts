import { file, ids, maybe, project, user } from './d1-records';
import { D1WorkStore } from './d1-work-store';
import type { FileRow, Project, Store, Synced, User } from './store';

const UPSERT_FILE = `INSERT INTO files (project, path, kind, locale, file, blob_sha, body)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT (project, path) DO UPDATE SET kind = excluded.kind, locale = excluded.locale,
    file = excluded.file, blob_sha = excluded.blob_sha, body = excluded.body`;

const BATCH = 50;

/** The store over a D1 database migrated by `migrations/`. */
export class D1Store extends D1WorkStore implements Store {
  async projects(): Promise<Project[]> {
    const { results } = await this.db.prepare('SELECT * FROM projects ORDER BY id').all();
    return results.map(project);
  }

  async project(id: string): Promise<Project | null> {
    return maybe(
      await this.db.prepare('SELECT * FROM projects WHERE id = ?1').bind(id).first(),
      project,
    );
  }

  async upsertProject(id: string, installationId: number, branch: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO projects (id, installation_id, branch) VALUES (?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET installation_id = excluded.installation_id, branch = excluded.branch`,
      )
      .bind(id, installationId, branch)
      .run();
  }

  async dropProjects(installationId: number, keep: readonly string[]): Promise<void> {
    const { results } = await this.db
      .prepare('SELECT id FROM projects WHERE installation_id = ?1')
      .bind(installationId)
      .all();
    const gone = ids(results).filter((id) => !keep.includes(id));
    if (gone.length === 0) {
      return;
    }
    await this.db.batch(
      gone.flatMap((id) => [
        this.db.prepare('DELETE FROM files WHERE project = ?1').bind(id),
        this.db.prepare('DELETE FROM projects WHERE id = ?1').bind(id),
      ]),
    );
  }

  async setSynced(id: string, s: Synced): Promise<void> {
    await this.db
      .prepare(
        `UPDATE projects SET head_sha = ?2, tree_sha = ?3, config = ?4, config_error = ?5, synced_at = ?6
         WHERE id = ?1`,
      )
      .bind(id, s.headSha, s.treeSha, s.config, s.configError, s.at)
      .run();
  }

  async files(projectId: string, locales?: readonly string[]): Promise<FileRow[]> {
    if (locales?.length === 0) {
      return [];
    }
    const placeholders = (locales ?? []).map((_, i) => `?${i + 2}`).join(', ');
    const filter = locales ? ` AND locale IN (${placeholders})` : '';
    const { results } = await this.db
      .prepare(
        `SELECT path, kind, locale, file, blob_sha, body FROM files WHERE project = ?1${filter}`,
      )
      .bind(projectId, ...(locales ?? []))
      .all();
    return results.map(file);
  }

  async replaceFiles(
    projectId: string,
    upserts: readonly FileRow[],
    removed: readonly string[],
  ): Promise<void> {
    const statements = [
      ...upserts.map((f) =>
        this.db
          .prepare(UPSERT_FILE)
          .bind(projectId, f.path, f.kind, f.locale, f.file, f.blobSha, f.body),
      ),
      ...removed.map((path) =>
        this.db.prepare('DELETE FROM files WHERE project = ?1 AND path = ?2').bind(projectId, path),
      ),
    ];
    const batches = Array.from({ length: Math.ceil(statements.length / BATCH) }, (_, i) =>
      statements.slice(i * BATCH, (i + 1) * BATCH),
    );
    await Promise.all(batches.map((batch) => this.db.batch(batch)));
  }

  async upsertUser(u: User, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO users (id, login, name, avatar_url, seen_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (id) DO UPDATE SET login = excluded.login, name = excluded.name,
           avatar_url = excluded.avatar_url, seen_at = excluded.seen_at`,
      )
      .bind(u.id, u.login, u.name, u.avatarUrl, now)
      .run();
  }

  async createSession(hash: string, userId: number, expiresAt: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM sessions WHERE expires_at < ?1')
        .bind(Math.floor(Date.now() / 1000)),
      this.db
        .prepare('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?1, ?2, ?3)')
        .bind(hash, userId, expiresAt),
    ]);
  }

  async sessionUser(hash: string, now: number): Promise<User | null> {
    const row = await this.db
      .prepare(
        `SELECT u.id, u.login, u.name, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.hash = ?1 AND s.expires_at > ?2`,
      )
      .bind(hash, now)
      .first();
    return maybe(row, user);
  }

  async deleteSession(hash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE hash = ?1').bind(hash).run();
  }

  async holdSetupCode(code: string, now: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM setup_codes WHERE created_at < ?1').bind(now - 3600),
      this.db
        .prepare('INSERT OR IGNORE INTO setup_codes (code, created_at) VALUES (?1, ?2)')
        .bind(code, now),
    ]);
  }
}
