import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KitI18n } from './i18n-instance';

const shouting = {
  translator: () => (key: string) => key.toUpperCase(),
} as unknown as KitI18n;

// Each standalone fallback is tested separately from explicit instance injection.
beforeEach(() => vi.resetModules());

// A fresh module here re-imports KROMA's whole catalog set, and under the
// coverage run's instrumentation that alone outruns the 5s default. The code
// being measured is four lines; the wait is the catalogs loading.
const CATALOGS_LOAD = 30_000;

const load = () => import('./i18n-instance');

describe('the instance the kit translates through', () => {
  it("speaks KROMA's catalogs by default", {
    timeout: CATALOGS_LOAD,
  }, async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await load();

    expect(translatorFor('en')('player.play')).toBe('Play');
    expect(fallbackLocale()).toBe('fr');
    expect(providerI18n()).toBeDefined();
  });

  it('uses an explicit instance without replacing the default', {
    timeout: CATALOGS_LOAD,
  }, async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await load();

    expect(translatorFor('fr', shouting)('player.play')).toBe('PLAYER.PLAY');
    expect(fallbackLocale()).toBe('fr');
    expect(providerI18n()).not.toBe(shouting);
  });
});

describe('the instance the published package translates through', () => {
  const loadPublished = () => import('./i18n-instance.published');

  it('renders every key as itself without an instance', async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await loadPublished();

    expect(translatorFor('en')('player.play')).toBe('player.play');
    expect(fallbackLocale()).toBe('en');
    expect(providerI18n()).toBeUndefined();
  });

  it('uses explicit host catalogs without changing the standalone fallback', async () => {
    const { fallbackLocale, providerI18n, translatorFor } = await loadPublished();

    expect(translatorFor('fr', shouting)('player.play')).toBe('PLAYER.PLAY');
    expect(fallbackLocale()).toBe('en');
    expect(providerI18n()).not.toBe(shouting);
  });
});
