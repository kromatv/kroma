import { describe, expect, it } from 'vitest';
import { D1Store } from './d1-store';
import type { FileRow } from './store';
import { fakeD1, type Rows } from './test-support';

const PROJECT = {
  id: 'o/r',
  branch: 'main',
  pinned: 1,
  config: '{}',
  config_error: null,
  head_sha: 'h',
  tree_sha: 't',
  synced_at: 5,
  branch_sha: 'b',
  etag: '"e"',
  files_done: 40,
  files_total: 90,
  sync_error: null,
  checked_at: 6,
};

const ADA = { id: 42, login: 'ada', name: null, avatar_url: 'https://a.test/ada.png' };

const answering =
  (prefix: string, rows: unknown[]): Rows =>
  (sql) =>
    sql.startsWith(prefix) ? rows : [];

const catalog = (path: string): FileRow => ({
  path,
  kind: 'catalog',
  locale: 'fr',
  file: 'p',
  blobSha: 'b',
  body: '{}',
});

describe('D1Store projects', () => {
  it('reads a project row into the shape the store hands out', async () => {
    const store = new D1Store(fakeD1(answering('SELECT * FROM projects', [PROJECT])));

    const [listed] = await store.projects();

    expect(listed).toEqual({
      id: 'o/r',
      branch: 'main',
      pinned: true,
      config: '{}',
      configError: null,
      headSha: 'h',
      treeSha: 't',
      syncedAt: 5,
      branchSha: 'b',
      etag: '"e"',
      progress: { done: 40, total: 90 },
      syncError: null,
      checkedAt: 6,
    });
    expect(await store.project('o/r')).toEqual(listed);
  });

  it('answers null for a project it does not hold', async () => {
    expect(await new D1Store(fakeD1()).project('o/r')).toBeNull();
  });

  it('reads no progress while no pass is reading toward a newer head', async () => {
    const row = { ...PROJECT, files_done: null, files_total: null };

    const found = await new D1Store(fakeD1(answering('SELECT * FROM projects', [row]))).project(
      'o/r',
    );

    expect(found?.progress).toBeNull();
  });

  it('records the branch a project is tracked on, what a sync read, and where a pass left off', async () => {
    const db = fakeD1();
    const store = new D1Store(db);

    await store.upsertProject({ id: 'o/r', branch: 'next', pinned: true });
    await store.upsertProject({ id: 'o/s', branch: 'main', pinned: false });
    await store.setSynced('o/r', {
      headSha: 'h',
      treeSha: 't',
      config: null,
      configError: 'missing',
      at: 9,
    });
    await store.setBranchHead('o/r', { sha: 'b', etag: null, progress: { done: 4, total: 9 } });
    await store.setBranchHead('o/r', { sha: 'b', etag: '"e"', progress: null });
    await store.endSync('o/r', { at: 10, error: 'down' });

    expect(db.ran.map((r) => r.values)).toEqual([
      ['o/r', 'next', 1],
      ['o/s', 'main', 0],
      ['o/r', 'h', 't', null, 'missing', 9, null],
      ['o/r', 'b', null, 4, 9],
      ['o/r', 'b', '"e"', null, null],
      ['o/r', 10, 'down'],
    ]);
  });

  it('claims a project for a pass, handing back the row the lease now holds', async () => {
    const db = fakeD1(answering('UPDATE projects SET syncing_until', [PROJECT]));

    const claimed = await new D1Store(db).claimSync('o/r', 100, 160);

    expect(claimed?.id).toBe('o/r');
    expect(db.ran[0]?.values).toEqual(['o/r', 100, 160]);
  });

  it('answers null while another pass holds the lease', async () => {
    expect(await new D1Store(fakeD1()).claimSync('o/r', 100, 160)).toBeNull();
  });

  it('drops the files and the row of each project no longer listed', async () => {
    const db = fakeD1(answering('SELECT id FROM projects', [{ id: 'o/r' }, { id: 'o/gone' }]));

    await new D1Store(db).dropProjects(['o/r']);

    expect(db.ran.slice(1)).toEqual([
      { sql: 'DELETE FROM files WHERE project = ?1', values: ['o/gone'] },
      { sql: 'DELETE FROM projects WHERE id = ?1', values: ['o/gone'] },
    ]);
  });

  it('drops nothing while every project is listed', async () => {
    const db = fakeD1(answering('SELECT id FROM projects', [{ id: 'o/r' }]));

    await new D1Store(db).dropProjects(['o/r']);

    expect(db.batches).toEqual([]);
  });
});

describe('D1Store files', () => {
  it('reads every file of a project, or only those of the languages asked for', async () => {
    const row = {
      path: 'loc/fr/p.json',
      kind: 'catalog',
      locale: 'fr',
      file: 'p',
      blob_sha: 'b',
      body: '{}',
    };
    const db = fakeD1(answering('SELECT path', [row]));
    const store = new D1Store(db);

    const all = await store.files('o/r');
    await store.files('o/r', ['fr', 'en']);

    expect(all).toEqual([
      { path: 'loc/fr/p.json', kind: 'catalog', locale: 'fr', file: 'p', blobSha: 'b', body: '{}' },
    ]);
    expect(db.ran.map((r) => r.values)).toEqual([['o/r'], ['o/r', 'fr', 'en']]);
    expect(db.ran[1]?.sql).toContain('AND locale IN (?2, ?3)');
  });

  it('reads nothing for an empty list of languages', async () => {
    const db = fakeD1();

    expect(await new D1Store(db).files('o/r', [])).toEqual([]);
    expect(db.ran).toEqual([]);
  });

  it('writes and removes files fifty statements to a batch', async () => {
    const db = fakeD1();
    const upserts = Array.from({ length: 120 }, (_, i) => catalog(`loc/fr/${i}.json`));

    await new D1Store(db).replaceFiles('o/r', upserts, ['loc/fr/old.json']);

    expect(db.batches).toEqual([50, 50, 21]);
    expect(db.ran.at(-1)).toEqual({
      sql: 'DELETE FROM files WHERE project = ?1 AND path = ?2',
      values: ['o/r', 'loc/fr/old.json'],
    });
  });
});

describe('D1Store sessions', () => {
  it('reads the account a live session belongs to', async () => {
    const store = new D1Store(fakeD1(answering('SELECT u.id', [ADA])));

    expect(await store.sessionUser('hash', 5)).toEqual({
      id: 42,
      login: 'ada',
      name: null,
      avatarUrl: 'https://a.test/ada.png',
    });
  });

  it('answers null for a session it does not hold', async () => {
    expect(await new D1Store(fakeD1()).sessionUser('hash', 5)).toBeNull();
  });

  it('purges expired sessions in the batch that opens a new one', async () => {
    const db = fakeD1();
    const store = new D1Store(db);

    await store.upsertUser({ id: 42, login: 'ada', name: null, avatarUrl: null }, 5);
    await store.createSession('hash', 42, 99);
    await store.deleteSession('hash');

    expect(db.batches).toEqual([2]);
    expect(db.ran.map((r) => r.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'INSERT INTO users',
      'DELETE FROM sessions',
      'INSERT INTO sessions',
      'DELETE FROM sessions',
    ]);
  });
});
