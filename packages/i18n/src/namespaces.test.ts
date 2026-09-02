import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createI18n } from './i18n';
import type { Catalog } from './types';

const ADMIN = {
  en: { 'admin.title': 'Console', 'admin.by': 'By $t(admin.brand)', 'admin.brand': 'KROMA' },
  fr: { 'admin.title': 'Console (fr)', 'admin.brand': 'KROMA' },
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function build() {
  const loads = {
    en: vi.fn(() => Promise.resolve(ADMIN.en)),
    fr: vi.fn(() => Promise.resolve(ADMIN.fr)),
  };
  const i18n = createI18n({
    catalogs: { en: { greeting: 'Hi' }, fr: { greeting: 'Bonjour' } },
    defaultLocale: 'en',
    lazy: { admin: loads },
  });
  return { i18n, loads };
}

describe('a namespace a chunk registers', () => {
  it('is fetched for the warmed locale only, and suspends that locale until it lands', async () => {
    const { i18n, loads } = build();
    i18n.warm('fr');

    i18n.register('admin', loads);
    const pending = i18n.pending('fr');

    expect(pending).toBeInstanceOf(Promise);
    expect(i18n.pending('en')).toBeNull();
    await pending;
    expect([i18n.translate('fr', 'admin.title' as 'greeting'), loads.en.mock.calls.length]).toEqual(
      ['Console (fr)', 0],
    );
    expect(i18n.pending('fr')).toBeNull();
  });

  it('is fetched for a locale warmed later, and hands the same promise back while in flight', async () => {
    const { i18n } = build();
    i18n.register('admin', { en: () => Promise.resolve(ADMIN.en) });

    i18n.warm('en');
    const first = i18n.pending('en');
    const second = i18n.pending('en');

    expect(first).toBe(second);
    await first;
    expect(i18n.translate('en', 'admin.title' as 'greeting')).toBe('Console');
  });

  it('lands at once when given the catalog itself, and announces it', () => {
    const { i18n } = build();
    const listener = vi.fn();
    i18n.subscribe(listener);

    i18n.register('admin', { en: ADMIN.en });

    expect(i18n.translate('en', 'admin.by' as 'greeting')).toBe('By KROMA');
    expect(i18n.pending('en')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('announces a locale once, when the last fetch in flight for it lands', async () => {
    const { i18n } = build();
    const listener = vi.fn();
    i18n.subscribe(listener);
    const slow = deferred<Catalog>();
    i18n.warm('en');

    i18n.register('admin', { en: () => Promise.resolve(ADMIN.en) });
    i18n.register('nav', { en: () => slow.promise });
    await Promise.resolve();
    const beforeSlow = listener.mock.calls.length;
    slow.resolve({ 'nav.home': 'Home' });
    await i18n.pending('en');

    expect(beforeSlow).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(i18n.translate('en', 'nav.home' as 'greeting')).toBe('Home');
  });
});

describe('a namespace only the folder offers', () => {
  it('is not fetched by warming, only by a miss, and in the missed locale alone', async () => {
    const { i18n, loads } = build();
    i18n.warm('fr');

    expect(loads.fr).not.toHaveBeenCalled();
    const before = i18n.translate('fr', 'admin.title' as 'greeting');
    await vi.waitFor(() =>
      expect(i18n.translate('fr', 'admin.title' as 'greeting')).toBe('Console (fr)'),
    );

    expect(before).toBe('admin.title');
    expect([loads.fr.mock.calls.length, loads.en.mock.calls.length]).toEqual([1, 0]);
  });

  it('is fetched once per locale however many keys miss', async () => {
    const { i18n, loads } = build();

    i18n.translate('en', 'admin.title' as 'greeting');
    i18n.translate('en', 'admin.by' as 'greeting');
    await vi.waitFor(() =>
      expect(i18n.translate('en', 'admin.title' as 'greeting')).toBe('Console'),
    );

    expect(loads.en).toHaveBeenCalledTimes(1);
  });

  it('leaves a miss outside every namespace alone', () => {
    const { i18n, loads } = build();

    i18n.translate('en', 'nope.x' as 'greeting');

    expect(loads.en).not.toHaveBeenCalled();
  });

  it('does not retry a failed fetch from a miss', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('offline')));
    const i18n = createI18n({
      catalogs: { en: { greeting: 'Hi' } },
      defaultLocale: 'en',
      lazy: { admin: { en: loader } },
    });
    i18n.warm('en');

    i18n.register('admin', { en: loader });
    await i18n.pending('en');
    i18n.translate('en', 'admin.title' as 'greeting');
    i18n.translate('en', 'admin.title' as 'greeting');

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('pending', () => {
  it('settles even when a fetch fails, so a suspended tree renders again', async () => {
    const gate = deferred<Catalog>();
    const i18n = createI18n({
      catalogs: { en: { greeting: 'Hi' } },
      defaultLocale: 'en',
    });
    i18n.warm('en');
    i18n.register('nav', { en: () => gate.promise.then(() => Promise.reject(new Error('gone'))) });
    const pending = i18n.pending('en');

    gate.resolve({});
    await pending;

    expect(i18n.pending('en')).toBeNull();
    expect(i18n.translate('en', 'nav.home' as 'greeting')).toBe('nav.home');
  });
});

describe('types', () => {
  it('come from the default locale catalog handed in', () => {
    const i18n = createI18n({
      catalogs: { en: { greeting: 'Hi' }, fr: { greeting: 'Bonjour', extra: 'x' } },
      defaultLocale: 'en',
    });

    expectTypeOf<Parameters<typeof i18n.translate>[1]>().toEqualTypeOf<'greeting'>();
    expectTypeOf<Parameters<typeof i18n.translate>[0]>().toEqualTypeOf<'en' | 'fr'>();
  });
});
