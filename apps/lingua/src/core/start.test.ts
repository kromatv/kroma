import { describe, expect, it } from 'vitest';
import { parsePolicy } from './policy';
import { shelfOf } from './shelf';
import { nameOf, startLocale } from './start';

const POLICY = '{ "source": "en", "locales": { "fr": {} } }';

function shelfHolding(files: Record<string, string>) {
  return shelfOf(
    'loc',
    Object.entries(files).map(([path, body]) => ({ path: `loc/${path}`, body })),
  );
}

function policy() {
  const parsed = parsePolicy(POLICY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.policy;
}

describe('nameOf', () => {
  it('names a language in another, as a heading', () => {
    expect(nameOf('de', 'fr')).toBe('Allemand');
  });

  it('has no name for a language Intl does not know, or in a tag that is not one', () => {
    expect([nameOf('qq', 'en'), nameOf('de', 'not a tag')]).toEqual([null, null]);
  });
});

describe('startLocale', () => {
  it('starts a language with an empty first file when the source names no language', () => {
    const shelf = shelfHolding({ 'i18n.json': POLICY, 'en/nav.json': '{ "nav.home": "Home" }' });

    const started = startLocale(shelf, policy(), 'de');

    expect(started).toBe(true);
    expect(JSON.parse(shelf.files.get('loc/de/nav.json') ?? '')).toEqual({});
    expect(JSON.parse(shelf.files.get('loc/i18n.json') ?? '').locales.de).toEqual({
      stage: 'draft',
    });
  });

  it('starts nothing for a language the project has, or without an i18n.json', () => {
    const listed = startLocale(shelfHolding({ 'i18n.json': POLICY }), policy(), 'fr');
    const unread = startLocale(shelfHolding({}), policy(), 'de');

    expect([listed, unread]).toEqual([false, false]);
  });
});
