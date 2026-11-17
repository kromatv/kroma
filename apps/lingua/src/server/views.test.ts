import { describe, expect, it } from 'vitest';
import type { Store } from '#site/store/store';
import { saveConfirms } from './confirms';
import { saveEdit } from './edits';
import { startLanguage } from './locales';
import { ada, pageContext, seededStore } from './test-support';
import { languageOf } from '#site/lib/language';
import { homeView, localeView, namespaceView, projectView, siteView } from './views';

async function storeWithWork(): Promise<Store> {
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
  return store;
}

describe('namespaceView', () => {
  it('tells where each message stands from the lock', async () => {
    const store = await seededStore();

    const view = await namespaceView(pageContext(store, null), 'o/r', { locale: 'fr', file: 'p' });

    expect(view?.rows.map((row) => [row.key, row.state])).toEqual([
      ['p.play', 'outdated'],
      ['p.n', 'missing'],
      ['p.n_one', 'missing'],
    ]);
  });

  it('reads a file in a sub-folder, and marks a machine translation unreviewed', async () => {
    const store = await seededStore();

    const view = await namespaceView(pageContext(store, null), 'o/r', {
      locale: 'fr',
      file: 'admin/backup',
    });

    expect(view?.rows.map((row) => [row.key, row.state])).toEqual([
      ['admin.backup.title', 'unreviewed'],
      ['admin.backup.run', 'missing'],
    ]);
  });

  it('gives a message every note about it, its own last', async () => {
    const store = await seededStore();

    const view = await namespaceView(pageContext(store, null), 'o/r', { locale: 'pl', file: 'p' });

    expect(view?.rows.find((row) => row.key === 'p.play')?.notes).toEqual([
      'Informal.',
      'The player.',
      'A verb.',
    ]);
  });
});

describe('projectView', () => {
  it('offers every language i18n.json lists, with its stage and its counts', async () => {
    const store = await seededStore();

    const view = await projectView(pageContext(store, null), 'o/r');

    expect(view?.locales.map((l) => [l.language.tag, l.stage, l.states])).toEqual([
      ['en', 'stable', { missing: 0, translated: 5, outdated: 0, unreviewed: 0 }],
      ['fr', 'stable', { missing: 3, translated: 0, outdated: 1, unreviewed: 1 }],
      ['pl', 'draft', { missing: 7, translated: 0, outdated: 0, unreviewed: 0 }],
    ]);
  });

  it('has no page for a project Lingua does not translate', async () => {
    expect(await projectView(pageContext(await seededStore(), null), 'x/y')).toBeNull();
  });

  it('lists no language for a project whose lingua.json does not read', async () => {
    const store = await seededStore();
    await store.setSynced('o/r', {
      headSha: 'h',
      treeSha: 't',
      config: null,
      configError: 'lingua.json is missing',
      at: 1,
    });

    const view = await projectView(pageContext(store, null), 'o/r');

    expect([view?.project.error, view?.locales]).toEqual(['lingua.json is missing', []]);
  });

  it('shows a language a contributor started to them alone', async () => {
    const store = await seededStore();
    await startLanguage(store, { user: ada, now: 1 }, { project: 'o/r', locale: 'de' });

    const theirs = await projectView(pageContext(store, ada), 'o/r');
    const anyone = await projectView(pageContext(store, null), 'o/r');

    expect(theirs?.locales.at(-1)).toMatchObject({
      language: { tag: 'de' },
      stage: 'draft',
      started: true,
    });
    expect(anyone?.locales.map((l) => l.language.tag)).toEqual(['en', 'fr', 'pl']);
  });
});

describe('homeView', () => {
  it('lists every project with its source language, for whoever is looking', async () => {
    const store = await seededStore();

    const view = await homeView(pageContext(store, ada));

    expect(view).toEqual({
      viewer: { login: 'ada', name: null, avatarUrl: null },
      projects: [
        {
          id: 'o/r',
          branch: 'main',
          source: languageOf('en'),
          locales: 3,
          syncedAt: 1,
          error: null,
          sync: { kind: 'current' },
        },
      ],
    });
  });

  it('says how far a sync of the branch has read', async () => {
    const store = await seededStore();
    await store.setBranchHead('o/r', { sha: 'moved', etag: null, progress: { done: 2, total: 5 } });

    const view = await homeView(pageContext(store, null));

    expect(view.projects[0]?.sync).toEqual({ kind: 'reading', progress: { done: 2, total: 5 } });
  });

  it('says why a project cannot be translated', async () => {
    const store = await seededStore();
    await store.upsertProject({ id: 'o/broken', branch: 'main', pinned: false });
    await store.setSynced('o/broken', {
      headSha: 'h',
      treeSha: 't',
      config: '{}',
      configError: null,
      at: 1,
    });
    await store.upsertProject({ id: 'o/missing', branch: 'main', pinned: false });
    await store.setSynced('o/missing', {
      headSha: 'h',
      treeSha: 't',
      config: null,
      configError: 'lingua.json is missing',
      at: 1,
    });
    await store.upsertProject({ id: 'o/unlisted', branch: 'main', pinned: false });
    await store.setSynced('o/unlisted', {
      headSha: 'h',
      treeSha: 't',
      config: JSON.stringify({ projects: [{ path: 'loc' }] }),
      configError: null,
      at: 1,
    });

    const view = await homeView(pageContext(store, null));

    expect(view.projects.map((p) => [p.id, p.source, p.locales, p.error !== null])).toEqual([
      ['o/broken', null, 0, true],
      ['o/missing', null, 0, true],
      ['o/r', languageOf('en'), 3, false],
      ['o/unlisted', null, 0, true],
    ]);
  });
});

describe('localeView', () => {
  it('counts the viewer’s drafts in each file of a language', async () => {
    const store = await storeWithWork();

    const view = await localeView(pageContext(store, ada), 'o/r', 'fr');

    expect(view?.namespaces.map((n) => [n.file, n.drafts])).toEqual([
      ['admin/backup', 1],
      ['p', 1],
    ]);
    expect([view?.drafts, view?.proposed, view?.proposal]).toEqual([2, 0, null]);
  });

  it('shows the pull request the viewer’s sent work rides in', async () => {
    const store = await storeWithWork();
    await startLanguage(store, { user: ada, now: 2 }, { project: 'o/r', locale: 'de' });
    await store.markProposed('o/r', ada.id, 'de');
    await store.saveProposal({
      project: 'o/r',
      userId: ada.id,
      locale: 'de',
      branch: 'b',
      prNumber: 9,
      prUrl: 'https://github.com/o/r/pull/9',
      headSha: 'h',
      updatedAt: 3,
    });

    const view = await localeView(pageContext(store, ada), 'o/r', 'de');

    expect([view?.drafts, view?.proposed, view?.proposal]).toEqual([
      0,
      1,
      { number: 9, url: 'https://github.com/o/r/pull/9' },
    ]);
  });

  it('has no page for a language the project does not offer', async () => {
    const store = await seededStore();

    const views = await Promise.all([
      localeView(pageContext(store, null), 'o/r', 'de'),
      localeView(pageContext(store, null), 'x/y', 'fr'),
    ]);

    expect(views).toEqual([null, null]);
  });
});

describe('namespaceView for a contributor', () => {
  it('shows the viewer’s draft and confirm on their rows', async () => {
    const store = await storeWithWork();

    const [p, backup] = await Promise.all([
      namespaceView(pageContext(store, ada), 'o/r', { locale: 'fr', file: 'p' }),
      namespaceView(pageContext(store, ada), 'o/r', { locale: 'fr', file: 'admin/backup' }),
    ]);

    expect(p?.rows[0]).toMatchObject({
      key: 'p.play',
      draft: 'Voir {title}',
      proposed: false,
      confirmed: false,
    });
    expect(backup?.rows[0]).toMatchObject({
      key: 'admin.backup.title',
      draft: null,
      confirmed: true,
    });
  });

  it('has no page for a file the source does not have, or a language the project does not offer', async () => {
    const store = await seededStore();

    const views = await Promise.all([
      namespaceView(pageContext(store, null), 'o/r', { locale: 'fr', file: 'nope' }),
      namespaceView(pageContext(store, null), 'o/r', { locale: 'de', file: 'p' }),
    ]);

    expect(views).toEqual([null, null]);
  });
});

describe('siteView', () => {
  it('says whether sign-in is set and who is signed in', async () => {
    const store = await seededStore();
    const env = { GITHUB_OAUTH_CLIENT_ID: 'id', GITHUB_OAUTH_CLIENT_SECRET: 'secret' };

    expect(siteView({ env, store, viewer: ada }, 'https://l.test')).toEqual({
      origin: 'https://l.test',
      signIn: true,
      viewer: { login: 'ada', name: null, avatarUrl: null },
    });
    expect(siteView(pageContext(store, null), 'https://l.test')).toEqual({
      origin: 'https://l.test',
      signIn: false,
      viewer: null,
    });
  });
});
