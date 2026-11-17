import { describe, expect, it } from 'vitest';
import { languageOf } from '#site/lib/language';
import { contributionsView } from './contributions';
import { saveConfirms } from './confirms';
import { saveEdit } from './edits';
import { startLanguage } from './locales';
import { ada, pageContext, seededStore } from './test-support';

const PR = {
  branch: 'ada:lingua/fr',
  prNumber: 7,
  prUrl: 'https://github.com/o/r/pull/7',
  headSha: 'h',
  updatedAt: 3,
};

describe('contributionsView', () => {
  it('has nothing for a visitor', async () => {
    expect(await contributionsView(pageContext(await seededStore(), null))).toEqual({
      viewer: null,
      contributions: [],
    });
  });

  it('lists each language the viewer has changes in, with the files their edits wait in', async () => {
    const store = await seededStore();
    await saveEdit(
      store,
      { user: ada, now: 2 },
      { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {title}' },
    );
    await saveEdit(
      store,
      { user: ada, now: 2 },
      {
        project: 'o/r',
        locale: 'fr',
        file: 'admin/backup',
        key: 'admin.backup.run',
        value: 'Lancer',
      },
    );
    await saveConfirms(
      store,
      { user: ada, now: 2 },
      { project: 'o/r', locale: 'fr', keys: ['admin.backup.title'] },
    );

    const view = await contributionsView(pageContext(store, ada));

    expect(view.contributions).toEqual([
      {
        project: 'o/r',
        language: languageOf('fr'),
        started: false,
        drafts: 3,
        proposed: 0,
        proposal: null,
        files: [
          { file: 'admin/backup', drafts: 1 },
          { file: 'p', drafts: 1 },
        ],
      },
    ]);
  });

  it('shows the pull request a sent language waits in, and a language the viewer started', async () => {
    const store = await seededStore();
    await saveEdit(
      store,
      { user: ada, now: 2 },
      { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {title}' },
    );
    await store.markProposed('o/r', ada.id, 'fr');
    await store.saveProposal({ project: 'o/r', userId: ada.id, locale: 'fr', ...PR });
    await startLanguage(store, { user: ada, now: 4 }, { project: 'o/r', locale: 'de' });

    const view = await contributionsView(pageContext(store, ada));

    expect(
      view.contributions.map((c) => [
        c.language.tag,
        c.started,
        c.drafts,
        c.proposed,
        c.proposal?.number ?? null,
        c.files,
      ]),
    ).toEqual([
      ['fr', false, 0, 1, 7, []],
      ['de', true, 1, 0, null, []],
    ]);
  });

  it('skips a project whose lingua.json does not read', async () => {
    const store = await seededStore();
    await store.upsertProject({ id: 'o/broken', branch: 'main', pinned: false });

    const view = await contributionsView(pageContext(store, ada));

    expect(view).toEqual({
      viewer: { login: 'ada', name: null, avatarUrl: null },
      contributions: [],
    });
  });
});
