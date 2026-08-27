import { afterEach, describe, expect, it } from 'vitest';
import { installKeyInspector } from '../dev-overrides';
import { createI18n } from '../i18n';
import { keyLabel } from './key-label';

function build() {
  return createI18n({
    catalogs: {
      en: { greeting: 'Hi', only: 'English only', item: '{count} items', item_one: '{count} item' },
      fr: { greeting: 'Bonjour' },
    },
    defaultLocale: 'en',
  });
}

afterEach(() => {
  installKeyInspector(null);
});

describe('the key label', () => {
  it('names the core catalog when the app answered', () => {
    const i18n = build();

    installKeyInspector(keyLabel);

    expect(i18n.translate('fr', 'greeting')).toBe('[core/greeting]');
  });

  it('names the module whose catalog answered, so ownership is readable', () => {
    const i18n = build();
    i18n.add('tv.kroma.torrents', { fr: { greeting: 'Salut' } });

    installKeyInspector(keyLabel);

    expect(i18n.translator('fr', 'tv.kroma.torrents')('greeting')).toBe(
      '[tv.kroma.torrents/greeting]',
    );
  });

  it('marks a key no catalog answers', () => {
    const i18n = build();

    installKeyInspector(keyLabel);

    expect(i18n.translate('fr', 'nope' as 'greeting')).toBe('[missing/nope]');
  });

  it('names the locale that answered when it is not the one asked for', () => {
    const i18n = build();

    installKeyInspector(keyLabel);

    expect(i18n.translate('fr', 'only')).toBe('[core@en/only]');
  });

  it('labels a plural message with the key as written, not the variant', () => {
    const i18n = build();

    installKeyInspector(keyLabel);

    expect(i18n.translate('en', 'item', { count: 1 })).toBe('[core/item]');
  });

  it('leaves the message alone again once it is uninstalled', () => {
    const i18n = build();

    installKeyInspector(keyLabel);
    installKeyInspector(null);

    expect(i18n.translate('fr', 'greeting')).toBe('Bonjour');
  });
});
