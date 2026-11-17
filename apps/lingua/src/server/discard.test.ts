import { describe, expect, it } from 'vitest';
import { saveConfirms } from './confirms';
import { discardDrafts } from './discard';
import { saveEdit } from './edits';
import { startLanguage } from './locales';
import { ada, seededStore } from './test-support';
import { pendingOf, viewerWork } from './work';
import { openProject } from './workspace';

describe('discardDrafts', () => {
  it('throws away the unsent edits and confirms of one language, and keeps the language', async () => {
    const store = await seededStore();
    await saveEdit(
      store,
      { user: ada, now: 2 },
      { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {title}' },
    );
    await saveConfirms(
      store,
      { user: ada, now: 2 },
      { project: 'o/r', locale: 'fr', keys: ['admin.backup.title'] },
    );

    const result = await discardDrafts(store, ada, { project: 'o/r', locale: 'fr' });

    expect(result).toEqual({ status: 200, discarded: 2, removed: false });
    expect(pendingOf(await viewerWork(store, ada, { project: 'o/r', locale: 'fr' }))).toEqual({
      drafts: 0,
      proposed: 0,
    });
  });

  it('removes a language the contributor started and never sent, with everything in it', async () => {
    const store = await seededStore();
    await startLanguage(store, { user: ada, now: 2 }, { project: 'o/r', locale: 'de' });
    await saveEdit(
      store,
      { user: ada, now: 3 },
      { project: 'o/r', locale: 'de', file: 'p', key: 'p.play', value: '{title} abspielen' },
    );

    const result = await discardDrafts(store, ada, { project: 'o/r', locale: 'de' });

    expect(result).toEqual({ status: 200, discarded: 2, removed: true });
    expect((await openProject(store, 'o/r', ada))?.workspace?.locales).not.toContain('de');
  });

  it('keeps what already rides in the pull request, and a started language that was sent', async () => {
    const store = await seededStore();
    await startLanguage(store, { user: ada, now: 2 }, { project: 'o/r', locale: 'de' });
    await saveEdit(
      store,
      { user: ada, now: 3 },
      { project: 'o/r', locale: 'de', file: 'p', key: 'p.play', value: '{title} abspielen' },
    );
    await store.markProposed('o/r', ada.id, 'de');
    await saveEdit(
      store,
      { user: ada, now: 4 },
      { project: 'o/r', locale: 'de', file: 'p', key: 'p.n_one', value: 'Ein Element' },
    );

    const result = await discardDrafts(store, ada, { project: 'o/r', locale: 'de' });

    expect(result).toEqual({ status: 200, discarded: 1, removed: false });
    expect(pendingOf(await viewerWork(store, ada, { project: 'o/r', locale: 'de' }))).toEqual({
      drafts: 0,
      proposed: 2,
    });
  });

  it('refuses a project Lingua does not translate, or a language it does not offer', async () => {
    const store = await seededStore();

    const results = await Promise.all([
      discardDrafts(store, ada, { project: 'o/nope', locale: 'fr' }),
      discardDrafts(store, ada, { project: 'o/r', locale: 'de' }),
    ]);

    expect(results.map((r) => r.status)).toEqual([404, 404]);
  });
});
