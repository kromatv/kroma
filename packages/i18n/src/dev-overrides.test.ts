import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeAppLocales,
  installAppLocales,
  installKeyInspector,
  installLocaleOverride,
  onOverridesChange,
  overridesRevision,
} from './dev-overrides';
import { createI18n } from './i18n';

afterEach(() => {
  installAppLocales(null);
  installLocaleOverride(null);
});

describe('what the app says it renders', () => {
  it('answers nothing until a provider has said anything', () => {
    expect(activeAppLocales()).toBeNull();
  });

  it('carries the codes and the resolved locale through', () => {
    installAppLocales({ codes: ['en', 'fr'], resolved: 'fr' });

    expect(activeAppLocales()).toEqual({ codes: ['en', 'fr'], resolved: 'fr' });
  });

  it('tells a listener when the answer changes', () => {
    const heard = vi.fn();
    const stop = onOverridesChange(heard);

    installAppLocales({ codes: ['en'], resolved: 'en' });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says nothing for the same answer given twice, so a render loop cannot start', () => {
    installAppLocales({ codes: ['en', 'fr'], resolved: 'fr' });
    const heard = vi.fn();
    const stop = onOverridesChange(heard);

    installAppLocales({ codes: ['en', 'fr'], resolved: 'fr' });
    stop();

    expect(heard).not.toHaveBeenCalled();
  });

  it('hears a locale list that changed length', () => {
    installAppLocales({ codes: ['en'], resolved: 'en' });
    const heard = vi.fn();
    const stop = onOverridesChange(heard);

    installAppLocales({ codes: ['en', 'fr'], resolved: 'en' });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('hears a locale list of the same length holding different codes', () => {
    installAppLocales({ codes: ['en', 'fr'], resolved: 'en' });
    const heard = vi.fn();
    const stop = onOverridesChange(heard);

    installAppLocales({ codes: ['en', 'de'], resolved: 'en' });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('hears the same list resolved to another locale', () => {
    installAppLocales({ codes: ['en', 'fr'], resolved: 'en' });
    const heard = vi.fn();
    const stop = onOverridesChange(heard);

    installAppLocales({ codes: ['en', 'fr'], resolved: 'fr' });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate a translator cache, having changed nothing that renders', () => {
    const before = overridesRevision();

    installAppLocales({ codes: ['en', 'fr'], resolved: 'fr' });

    expect(overridesRevision()).toBe(before);
  });

  it('still invalidates one for a locale override, which does change what renders', () => {
    const before = overridesRevision();

    installLocaleOverride('en');

    expect(overridesRevision()).toBeGreaterThan(before);
  });
});

describe('a message an inspector watches', () => {
  it('reaches the inspector even where no catalog in the chain answers', () => {
    const seen: Array<{ key: string; from: unknown; text: string }> = [];
    const i18n = createI18n({ catalogs: { en: { greeting: 'Hi' } }, defaultLocale: 'en' });
    installKeyInspector((rendered) => {
      seen.push({ key: rendered.key, from: rendered.from, text: rendered.text });
      return rendered.text;
    });

    const rendered = i18n.translator('en', 'tv.kroma.notes')('nothing.answers');
    installKeyInspector(null);

    expect(rendered).toBe('nothing.answers');
    expect(seen[0]).toEqual({
      key: 'nothing.answers',
      from: undefined,
      text: 'nothing.answers',
    });
  });
});
