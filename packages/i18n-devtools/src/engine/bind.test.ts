import { afterEach, describe, expect, it } from 'vitest';
import { setLive } from '../live';
import { testEngine } from '../testing';
import { bindEngine } from './bind';
import { setEngine } from './engine';
import { inspectorFor } from './inspector';

function watched() {
  const asked: Array<string | null> = [];
  const locales: Array<string | null> = [];
  setEngine(
    testEngine({
      inspect: (inspector) => asked.push(inspector === null ? null : 'inspector'),
      overrideLocale: (locale) => locales.push(locale),
    }),
  );
  return { asked, locales };
}

afterEach(() => {
  setLive({ keys: false, outline: 'off', locale: null });
  setEngine(null);
});

describe('holding the engine to the switches', () => {
  it('sets it to what they already say, before anything moves', () => {
    const { asked, locales } = watched();

    const stop = bindEngine();
    stop();

    expect([asked, locales]).toEqual([[null], [null]]);
  });

  it('sets it again whenever one of them moves', () => {
    const { asked } = watched();
    const stop = bindEngine();

    setLive({ keys: true });
    stop();

    expect(asked).toEqual([null, 'inspector']);
  });

  it('carries the locale override through', () => {
    const { locales } = watched();
    const stop = bindEngine();

    setLive({ locale: 'fr' });
    stop();

    expect(locales).toEqual([null, 'fr']);
  });

  it('leaves the engine as it is when it stops watching, so a refresh keeps the switch', () => {
    const { asked } = watched();
    const stop = bindEngine();
    setLive({ keys: true });

    stop();
    setLive({ keys: false });

    expect(asked).toEqual([null, 'inspector']);
  });

  it('asks for the one inspector that stands for those switches', () => {
    let installed: unknown;
    setEngine(
      testEngine({
        inspect: (inspector) => {
          installed = inspector;
        },
      }),
    );
    setLive({ keys: true, outline: 'all' });

    bindEngine()();

    expect(installed).toBe(inspectorFor(true, 'all'));
  });
});
