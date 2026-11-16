import { describe, expect, it } from 'vitest';
import { D1WorkStore } from './d1-work-store';
import { fakeD1, type Rows } from './test-support';

const MINE = { project: 'o/r', user_id: 42, locale: 'fr' };

const PROPOSAL = {
  ...MINE,
  branch: 'lingua/fr',
  pr_number: 9,
  pr_url: 'https://github.com/o/r/pull/9',
  head_sha: 'h',
  updated_at: 3,
};

const byTable =
  (tables: Record<string, unknown[]>): Rows =>
  (sql) =>
    tables[/FROM (\w+)/.exec(sql)?.[1] ?? ''] ?? [];

const tablesTouched = (sqls: readonly string[]) =>
  sqls.map((sql) => /(?:FROM|UPDATE) (\w+)/.exec(sql)?.[1]);

describe('D1WorkStore', () => {
  it('reads a contributor’s edits, confirms and started languages, proposed or not', async () => {
    const store = new D1WorkStore(
      fakeD1(
        byTable({
          edits: [{ ...MINE, file: 'p', key: 'p.play', value: 'Lire', proposed: 1, updated_at: 2 }],
          confirms: [{ ...MINE, key: 'p.n', proposed: 0, updated_at: 2 }],
          starts: [{ ...MINE, proposed: 0, created_at: 1 }],
        }),
      ),
    );

    const [edits, confirms, starts] = await Promise.all([
      store.edits('o/r', 42, 'fr'),
      store.confirms('o/r', 42, 'fr'),
      store.starts('o/r', 42),
    ]);

    expect(edits).toEqual([
      {
        project: 'o/r',
        userId: 42,
        locale: 'fr',
        file: 'p',
        key: 'p.play',
        value: 'Lire',
        proposed: true,
        updatedAt: 2,
      },
    ]);
    expect(confirms).toEqual([
      { project: 'o/r', userId: 42, locale: 'fr', key: 'p.n', proposed: false, updatedAt: 2 },
    ]);
    expect(starts).toEqual([
      { project: 'o/r', userId: 42, locale: 'fr', proposed: false, createdAt: 1 },
    ]);
  });

  it('writes whether a piece of work was proposed as SQLite’s 1 or 0', async () => {
    const db = fakeD1();
    const store = new D1WorkStore(db);
    const mine = { project: 'o/r', userId: 42, locale: 'fr' };

    await store.putEdit({
      ...mine,
      file: 'p',
      key: 'p.play',
      value: 'Lire',
      proposed: true,
      updatedAt: 2,
    });
    await store.putConfirm({ ...mine, key: 'p.n', proposed: false, updatedAt: 2 });
    await store.putStart({ ...mine, proposed: false, createdAt: 1 });
    await store.deleteEdit({ ...mine, key: 'p.play' });

    expect(db.ran.map((r) => r.values)).toEqual([
      ['o/r', 42, 'fr', 'p', 'p.play', 'Lire', 1, 2],
      ['o/r', 42, 'fr', 'p.n', 0, 2],
      ['o/r', 42, 'fr', 0, 1],
      ['o/r', 42, 'fr', 'p.play'],
    ]);
  });

  it('drops the unsent work of one language across edits, confirms and starts', async () => {
    const db = fakeD1();

    await new D1WorkStore(db).dropUnsent('o/r', 42, 'fr');

    expect(db.batches).toEqual([3]);
    expect(tablesTouched(db.ran.map((r) => r.sql))).toEqual(['edits', 'confirms', 'starts']);
    expect(db.ran.every((r) => r.sql.endsWith('AND proposed = 0'))).toBe(true);
  });

  it('marks every piece of one language’s work as proposed', async () => {
    const db = fakeD1();

    await new D1WorkStore(db).markProposed('o/r', 42, 'fr');

    expect(tablesTouched(db.ran.map((r) => r.sql))).toEqual(['edits', 'confirms', 'starts']);
    expect(db.ran.map((r) => r.values)).toEqual(Array.from({ length: 3 }, () => ['o/r', 42, 'fr']));
  });

  it('finds a pull request by its contributor’s language and by its branch', async () => {
    const store = new D1WorkStore(fakeD1(byTable({ proposals: [PROPOSAL] })));

    const mine = await store.proposal('o/r', 42, 'fr');

    expect(mine).toEqual({
      project: 'o/r',
      userId: 42,
      locale: 'fr',
      branch: 'lingua/fr',
      prNumber: 9,
      prUrl: PROPOSAL.pr_url,
      headSha: 'h',
      updatedAt: 3,
    });
    expect(await store.proposalByBranch('o/r', 'lingua/fr')).toEqual(mine);
  });

  it('answers null for a pull request it does not hold', async () => {
    expect(await new D1WorkStore(fakeD1()).proposalByBranch('o/r', 'lingua/fr')).toBeNull();
  });

  it('forgets a closed pull request with the work it carried, in one batch', async () => {
    const db = fakeD1();
    const proposal = {
      project: 'o/r',
      userId: 42,
      locale: 'fr',
      branch: 'b',
      prNumber: 9,
      prUrl: 'u',
      headSha: 'h',
      updatedAt: 3,
    };
    const store = new D1WorkStore(db);

    await store.saveProposal(proposal);
    await store.closeProposal(proposal);

    expect(db.batches).toEqual([4]);
    expect(tablesTouched(db.ran.slice(1).map((r) => r.sql))).toEqual([
      'edits',
      'confirms',
      'starts',
      'proposals',
    ]);
    expect(db.ran.slice(1, 4).every((r) => r.sql.endsWith('AND proposed = 1'))).toBe(true);
  });
});
