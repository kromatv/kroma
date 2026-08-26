import { describe, expect, it, vi } from 'vitest';
import { createI18n } from './i18n';

function build() {
  return createI18n({
    catalogs: {
      en: { 'lang.en': 'English', greeting: 'Hi', item: '{count} items', item_one: '{count} item' },
      fr: { 'lang.fr': 'Français', greeting: 'Bonjour' },
    },
    defaultLocale: 'en',
  });
}

describe('createI18n', () => {
  it('translates, pluralises and falls back to the default locale', () => {
    const i18n = build();

    expect(i18n.translate('fr', 'greeting')).toBe('Bonjour');
    expect(i18n.translate('en', 'item', { count: 1 })).toBe('1 item');
    expect(i18n.translate('fr', 'item', { count: 5 })).toBe('5 items');
  });

  it('returns the key itself when no catalog knows it', () => {
    expect(build().translate('en', 'nope' as 'greeting')).toBe('nope');
  });

  it('binds a locale', () => {
    const t = build().translator('fr');

    expect(t('greeting')).toBe('Bonjour');
  });

  it('defers to a supplied plural rule', () => {
    const i18n = createI18n({
      catalogs: { en: { n: '{count} items', n_one: '{count} item' } },
      defaultLocale: 'en',
      plural: () => 'one',
    });

    expect(i18n.translate('en', 'n', { count: 7 })).toBe('7 item');
  });
});

describe('translator identity', () => {
  it('hands back the same function for the same locale and scope', () => {
    const i18n = build();

    expect(i18n.translator('fr')).toBe(i18n.translator('fr'));
    expect(i18n.translator('fr', 'mod')).toBe(i18n.translator('fr', 'mod'));
    expect(i18n.translator('fr')).not.toBe(i18n.translator('en'));
    expect(i18n.translator('fr')).not.toBe(i18n.translator('fr', 'mod'));
  });

  it('keeps a translator reading catalogs added after it was handed out', () => {
    const i18n = build();
    const t = i18n.translator('en', 'mod');

    i18n.add('mod', { en: { own: 'Mine' } });

    expect(t('own')).toBe('Mine');
  });
});

describe('runtime catalogs', () => {
  it('reads a scope its own messages, and the app the app-wide ones', () => {
    const i18n = build();

    i18n.add('mod', { en: { greeting: 'Yo', own: 'Mine' } });

    expect(i18n.translator('en', 'mod')('greeting')).toBe('Yo');
    expect(i18n.translator('en', 'mod')('own')).toBe('Mine');
    expect(i18n.translate('en', 'greeting')).toBe('Hi');
  });

  it('keeps one scope invisible to another, and to no scope at all', () => {
    const i18n = build();

    i18n.add('a', { en: { shared: 'From A' } });
    i18n.add('b', { en: { shared: 'From B' } });

    expect(i18n.translator('en', 'a')('shared')).toBe('From A');
    expect(i18n.translator('en', 'b')('shared')).toBe('From B');
    expect(i18n.translator('en')('shared' as 'greeting')).toBe('shared');
  });

  it('falls through a scope to the app catalogs for a key it does not carry', () => {
    const i18n = build();

    i18n.add('mod', { en: { own: 'Mine' } });

    expect(i18n.translator('en', 'mod')('greeting')).toBe('Hi');
  });

  it('falls back through the scope default locale before the app ones', () => {
    const i18n = build();

    i18n.add('mod', { en: { only: 'English only' } });

    expect(i18n.translator('fr', 'mod')('only')).toBe('English only');
  });

  it('removes a scope when its disposer runs', () => {
    const i18n = build();

    const dispose = i18n.add('mod', { en: { own: 'Mine' } });
    dispose();

    expect(i18n.translator('en', 'mod')('own')).toBe('own');
  });

  it('replaces a scope rather than layering it when added twice', () => {
    const i18n = build();

    i18n.add('mod', { en: { own: 'First' } });
    i18n.add('mod', { en: { other: 'Second' } });

    expect(i18n.translator('en', 'mod')('own')).toBe('own');
    expect(i18n.translator('en', 'mod')('other')).toBe('Second');
  });

  it('ignores a stale disposer once the scope has been replaced', () => {
    const i18n = build();

    const stale = i18n.add('mod', { en: { own: 'First' } });
    i18n.add('mod', { en: { own: 'Second' } });
    stale();

    expect(i18n.translator('en', 'mod')('own')).toBe('Second');
  });

  it('expands references inside an added catalog', () => {
    const i18n = build();

    i18n.add('mod', { en: { brand: 'Torrents', title: '$t(brand) queue' } });

    expect(i18n.translator('en', 'mod')('title')).toBe('Torrents queue');
  });

  it('announces a change so a view can re-read', () => {
    const i18n = build();
    const listener = vi.fn();

    const stop = i18n.subscribe(listener);
    const before = i18n.version();
    const dispose = i18n.add('mod', { en: { own: 'Mine' } });
    const after = i18n.version();
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(after).toBeGreaterThan(before);
    stop();
  });

  it('stops announcing once unsubscribed', () => {
    const i18n = build();
    const listener = vi.fn();

    i18n.subscribe(listener)();
    i18n.add('mod', { en: { own: 'Mine' } });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('has', () => {
  it('answers for the default catalog, which is the complete one', () => {
    const i18n = build();

    expect(i18n.has('greeting')).toBe(true);
    expect(i18n.has('lang.fr')).toBe(false);
    expect(i18n.has('nope')).toBe(false);
  });
});
