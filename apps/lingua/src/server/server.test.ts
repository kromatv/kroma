import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import type { Store, User } from '#site/store/store';
import { saveEdit } from './edits';
import { closeSession, openSession, readCookie, viewerOf } from './session';
import { verifySignature } from './webhook';

const ada: User = { id: 42, login: 'ada', name: null, avatarUrl: null };
const CONFIG = JSON.stringify({ source: 'en', locales: ['fr', 'pl'], catalogs: [{ path: 'loc/{locale}/{namespace}.json' }] });

async function seeded(): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject('o/r', 1, 'main');
  await store.setSynced('o/r', { headSha: 'h', treeSha: 't', config: CONFIG, configError: null, at: 1 });
  await store.replaceFiles(
    'o/r',
    [
      { path: 'loc/en/p.json', catalog: 0, locale: 'en', namespace: 'p', blobSha: 'x', body: '{"p.play":"Play {title}","p.n":"{count} items","p.n_one":"One item"}' },
      { path: 'loc/fr/p.json', catalog: 0, locale: 'fr', namespace: 'p', blobSha: 'y', body: '{"p.play":"Lire {title}"}' },
    ],
    [],
  );
  return store;
}

const edit = (key: string, value: string) => ({ project: 'o/r', locale: 'fr', namespace: 'p', key, value });

describe('saveEdit', () => {
  it('keeps a translation that renders the same placeholders', async () => {
    const store = await seeded();

    const result = await saveEdit(store, ada, edit('p.play', 'Regarder {title}'), 5);

    expect(result).toEqual({ status: 200, draft: 'Regarder {title}', issues: [] });
    expect((await store.edits('o/r', ada.id, 'fr')).map((e) => e.value)).toEqual(['Regarder {title}']);
  });

  it('refuses a translation that would print a placeholder nobody fills', async () => {
    const store = await seeded();

    const result = await saveEdit(store, ada, edit('p.play', 'Lire {name}'), 5);

    expect(result).toMatchObject({ status: 422, issues: [{ code: 'unknown-token', detail: 'name' }, { code: 'missing-token' }] });
    expect(await store.edits('o/r', ada.id, 'fr')).toEqual([]);
  });

  it('drops the edit when it says what the branch already says, or nothing', async () => {
    const store = await seeded();
    await saveEdit(store, ada, edit('p.play', 'Regarder {title}'), 5);

    await saveEdit(store, ada, edit('p.play', 'Lire {title}'), 6);

    expect(await store.edits('o/r', ada.id, 'fr')).toEqual([]);
  });

  it('accepts a plural form the language owes even though the source file lacks it', async () => {
    const store = await seeded();

    const polish = await saveEdit(store, ada, { ...edit('p.n_many', '{count} elementów'), locale: 'pl' }, 5);
    const french = await saveEdit(store, ada, edit('p.n_many', '{count} d’éléments'), 5);

    expect(polish.status).toBe(200);
    expect(french.status).toBe(404);
  });

  it('refuses a key the source does not have, and a language the project does not offer', async () => {
    const store = await seeded();

    expect((await saveEdit(store, ada, edit('p.nope', 'x'), 5)).status).toBe(404);
    expect((await saveEdit(store, ada, { ...edit('p.play', 'x'), locale: 'de' }, 5)).status).toBe(404);
  });
});

describe('sessions', () => {
  it('recognises the account a session cookie belongs to until it is closed', async () => {
    const store = memoryStore();
    const set = await openSession(store, ada, 100);
    const header = `other=1; ${set.split(';')[0]}`;

    expect(await viewerOf(store, header, 101)).toEqual(ada);
    expect(set).toContain('HttpOnly; Secure; SameSite=Lax');

    await closeSession(store, header);

    expect(await viewerOf(store, header, 102)).toBeNull();
  });

  it('reads one cookie out of many', () => {
    expect(readCookie('a=1; b=x%20y; c=3', 'b')).toBe('x y');
    expect(readCookie(undefined, 'b')).toBeNull();
  });
});

describe('verifySignature', () => {
  it('accepts GitHub’s HMAC of the exact body and nothing else', async () => {
    const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';

    expect(await verifySignature("It's a Secret to Everybody", 'Hello, World!', signature)).toBe(true);
    expect(await verifySignature("It's a Secret to Everybody", 'Hello, World?', signature)).toBe(false);
    expect(await verifySignature("It's a Secret to Everybody", 'Hello, World!', null)).toBe(false);
  });
});
