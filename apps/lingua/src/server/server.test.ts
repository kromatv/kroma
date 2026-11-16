import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import { saveConfirms } from './confirms';
import { saveEdit } from './edits';
import { startLanguage } from './locales';
import { closeSession, openSession, readCookie, viewerOf } from './session';
import { ada, seededStore } from './test-support';

const edit = (key: string, value: string) => ({ project: 'o/r', locale: 'fr', file: 'p', key, value });

describe('saveEdit', () => {
  it('keeps a translation that renders the same placeholders', async () => {
    const store = await seededStore();

    const result = await saveEdit(store, ada, edit('p.play', 'Regarder {title}'), 5);

    expect(result).toEqual({ status: 200, draft: 'Regarder {title}', issues: [] });
    expect((await store.edits('o/r', ada.id, 'fr')).map((e) => [e.file, e.value])).toEqual([['p', 'Regarder {title}']]);
  });

  it('refuses a translation that would print a placeholder nobody fills', async () => {
    const store = await seededStore();

    const result = await saveEdit(store, ada, edit('p.play', 'Lire {name}'), 5);

    expect(result).toMatchObject({ status: 422, issues: [{ code: 'unknown-token', detail: 'name' }, { code: 'missing-token' }] });
    expect(await store.edits('o/r', ada.id, 'fr')).toEqual([]);
  });

  it('drops the edit when it says what the branch already says, or nothing', async () => {
    const store = await seededStore();
    await saveEdit(store, ada, edit('p.play', 'Regarder {title}'), 5);

    await saveEdit(store, ada, edit('p.play', 'Lire {title}'), 6);

    expect(await store.edits('o/r', ada.id, 'fr')).toEqual([]);
  });

  it('accepts a plural form the language owes even though the source file lacks it', async () => {
    const store = await seededStore();

    const polish = await saveEdit(store, ada, { ...edit('p.n_many', '{count} elementów'), locale: 'pl' }, 5);
    const french = await saveEdit(store, ada, edit('p.n_many', '{count} d’éléments'), 5);

    expect(polish.status).toBe(200);
    expect(french.status).toBe(404);
  });

  it('refuses a key the source does not have, and a language the project does not offer', async () => {
    const store = await seededStore();

    expect((await saveEdit(store, ada, edit('p.nope', 'x'), 5)).status).toBe(404);
    expect((await saveEdit(store, ada, { ...edit('p.play', 'x'), locale: 'de' }, 5)).status).toBe(404);
  });

  it('takes a message of a file in a sub-folder', async () => {
    const store = await seededStore();

    const result = await saveEdit(store, ada, { ...edit('admin.backup.run', 'Lancer'), file: 'admin/backup' }, 5);

    expect(result.status).toBe(200);
  });
});

describe('saveConfirms', () => {
  it('keeps a confirm of each message, a plural form counting as its base', async () => {
    const store = await seededStore();

    const result = await saveConfirms(store, ada, { project: 'o/r', locale: 'fr', keys: ['p.play', 'p.n_one', 'p.n'] }, 5);

    expect(result).toEqual({ status: 200, confirmed: ['p.play', 'p.n'] });
    expect((await store.confirms('o/r', ada.id, 'fr')).map((c) => c.key)).toEqual(['p.n', 'p.play']);
  });

  it('refuses the source language, and keys that are no message', async () => {
    const store = await seededStore();

    const source = await saveConfirms(store, ada, { project: 'o/r', locale: 'en', keys: ['p.play'] }, 5);
    const unknown = await saveConfirms(store, ada, { project: 'o/r', locale: 'fr', keys: ['p.nope'] }, 5);

    expect([source.status, unknown.status]).toEqual([404, 404]);
  });
});

describe('startLanguage', () => {
  it('starts a language for the contributor, named in itself', async () => {
    const store = await seededStore();

    const result = await startLanguage(store, ada, { project: 'o/r', locale: 'de' }, 5);

    expect(result).toEqual({ status: 200, locale: 'de', name: 'Deutsch' });
    expect((await store.starts('o/r', ada.id)).map((s) => s.locale)).toEqual(['de']);
  });

  it('refuses a language the project or the contributor has already', async () => {
    const store = await seededStore();
    await startLanguage(store, ada, { project: 'o/r', locale: 'de' }, 5);

    const listed = await startLanguage(store, ada, { project: 'o/r', locale: 'pl' }, 6);
    const again = await startLanguage(store, ada, { project: 'o/r', locale: 'de' }, 6);

    expect([listed.status, again.status]).toEqual([409, 409]);
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
