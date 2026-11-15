import { afterEach, describe, expect, it } from 'vitest';
import { setLive } from '../live';
import { testEngine } from '../testing';
import { setEngine } from './engine';
import { renderedLocale } from './rendered-locale';

afterEach(() => {
  setEngine(null);
  setLive({ keys: false, outline: 'off', locale: null });
});

describe('the locale every message is rendered in', () => {
  it('is the one the app resolved while nothing overrides it', () => {
    setEngine(testEngine({ activeLocale: () => 'fr' }));

    expect(renderedLocale()).toBe('fr');
  });

  it('is the override while the panel holds one', () => {
    setEngine(testEngine({ activeLocale: () => 'fr' }));

    setLive({ locale: 'de' });

    expect(renderedLocale()).toBe('de');
  });
});
