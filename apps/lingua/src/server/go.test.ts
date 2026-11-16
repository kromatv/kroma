import { describe, expect, it } from 'vitest';
import { api } from './api';
import { messagePage } from './go';
import { seededStore } from './test-support';

const link = (locale: string, key: string) => ({ owner: 'o', repo: 'r', locale, key });

describe('messagePage', () => {
  it('lands on the row of the message, on the page of the file that holds it', async () => {
    const store = await seededStore();

    const page = await messagePage(store, null, link('fr', 'admin.backup.title'));

    expect(page).toBe('/o/r/fr/admin/backup#admin.backup.title');
  });

  it('finds a plural form by its base, and falls back to the base row a language does not split', async () => {
    const store = await seededStore();

    const owed = await messagePage(store, null, link('pl', 'p.n_few'));
    const folded = await messagePage(store, null, link('fr', 'p.n_few'));

    expect(owed).toBe('/o/r/pl/p#p.n_few');
    expect(folded).toBe('/o/r/fr/p#p.n');
  });

  it('falls back to the closest page that exists', async () => {
    const store = await seededStore();

    const pages = await Promise.all([
      messagePage(store, null, link('fr', 'p.nope')),
      messagePage(store, null, link('de', 'p.play')),
      messagePage(store, null, { owner: 'x', repo: 'y', locale: 'fr', key: 'p.play' }),
    ]);

    expect(pages).toEqual(['/o/r/fr', '/o/r', '/']);
  });
});

describe('GET /go', () => {
  it("redirects to a message of this repository's catalogs", async () => {
    const request = new Request('https://lingua.test/go/kromatv/kroma/en/admin.aiAddProvider');

    const response = await api(request, {});

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/kromatv/kroma/en/admin/ai#admin.aiAddProvider');
  });
});
