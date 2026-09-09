import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KitI18n } from './i18n-instance';

const shouting = {
  translator: () => (key: string) => key.toUpperCase(),
} as unknown as KitI18n;

// The installed instance is module state with no reset, which is what it should
// be: a host installs one once, at start-up. Each test gets its own module.
beforeEach(() => vi.resetModules());

// A fresh module here re-imports KROMA's whole catalog set, and under the
// coverage run's instrumentation that alone outruns the 5s default. The code
// being measured is four lines; the wait is the catalogs loading.
const CATALOGS_LOAD = 30_000;

const load = () => import('./i18n-instance');

describe('the instance the kit translates through', () => {
  it("speaks KROMA's catalogs until a host installs its own", {
    timeout: CATALOGS_LOAD,
  }, async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await load();

    expect(translatorFor('en')('player.play')).toBe('Play');
    expect(fallbackLocale()).toBe('fr');
    expect(providerI18n()).toBeDefined();
  });

  it('speaks the installed one once a host gives it one', { timeout: CATALOGS_LOAD }, async () => {
    const { fallbackLocale, providerI18n, setKitI18n, translatorFor } = await load();

    setKitI18n(shouting, 'fr');

    expect(translatorFor('fr')('player.play')).toBe('PLAYER.PLAY');
    expect(fallbackLocale()).toBe('fr');
    expect(providerI18n()).toBe(shouting);
  });
});

describe('the instance the published package translates through', () => {
  const loadPublished = () => import('./i18n-instance.published');

  it('renders every key as itself until a host installs one', async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await loadPublished();

    expect(translatorFor('en')('player.play')).toBe('player.play');
    expect(fallbackLocale()).toBe('en');
    expect(providerI18n()).toBeUndefined();
  });

  it('speaks the host catalogs it is given', async () => {
    const { fallbackLocale, providerI18n, setKitI18n, translatorFor } = await loadPublished();

    setKitI18n(shouting, 'fr');

    expect(translatorFor('fr')('player.play')).toBe('PLAYER.PLAY');
    expect(fallbackLocale()).toBe('fr');
    expect(providerI18n()).toBe(shouting);
  });
});
