import { describe, expect, it } from 'vitest';
import { startLanguage } from './locales';
import { ada, pageContext, seededStore } from './test-support';
import { namespaceView, projectView } from './views';

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

  it('shows a language a contributor started to them alone', async () => {
    const store = await seededStore();
    await startLanguage(store, ada, { project: 'o/r', locale: 'de' }, 1);

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
