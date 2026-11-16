import { describe, expect, it } from 'vitest';
import { languageOf } from '#site/lib/language';
import { startLanguage } from './locales';
import { messageSearch, projectIndex } from './search';
import { ada, pageContext, seededStore } from './test-support';

describe('projectIndex', () => {
  it('lists each project with the languages the viewer can open, their own started ones too', async () => {
    const store = await seededStore();
    await startLanguage(store, ada, { project: 'o/r', locale: 'de' }, 1);

    const [anyone, theirs] = await Promise.all([projectIndex(pageContext(store, null)), projectIndex(pageContext(store, ada))]);

    expect(anyone).toEqual([{ id: 'o/r', languages: ['en', 'fr', 'pl'].map(languageOf) }]);
    expect(theirs[0]?.languages.map((l) => l.tag)).toEqual(['en', 'fr', 'pl', 'de']);
  });

  it('lists a project whose lingua.json does not read with no language', async () => {
    const store = await seededStore();
    await store.upsertProject({ id: 'o/broken', branch: 'main', pinned: false });

    expect(await projectIndex(pageContext(store, null))).toContainEqual({ id: 'o/broken', languages: [] });
  });
});

describe('messageSearch', () => {
  it('finds a language’s messages by key, source or translation, with the file each lives in', async () => {
    const store = await seededStore();

    const [byText, byKey] = await Promise.all([
      messageSearch(pageContext(store, null), 'o/r', { locale: 'fr', query: 'sauvegarde' }),
      messageSearch(pageContext(store, null), 'o/r', { locale: 'fr', query: 'p.play' }),
    ]);

    expect(byText).toEqual([{ key: 'admin.backup.title', file: 'admin/backup', source: 'Backup', text: 'Sauvegarde' }]);
    expect(byKey).toEqual([{ key: 'p.play', file: 'p', source: 'Play {title}', text: 'Lire {title}' }]);
  });

  it('finds nothing in a language or project Lingua does not offer, or for a one-letter query', async () => {
    const store = await seededStore();
    const ctx = pageContext(store, null);

    const found = await Promise.all([
      messageSearch(ctx, 'o/r', { locale: 'de', query: 'play' }),
      messageSearch(ctx, 'x/y', { locale: 'fr', query: 'play' }),
      messageSearch(ctx, 'o/r', { locale: 'fr', query: 'p' }),
    ]);

    expect(found).toEqual([[], [], []]);
  });
});
