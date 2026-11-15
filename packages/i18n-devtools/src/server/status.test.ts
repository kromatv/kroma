import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../engine/engine';
import { heldStatus, wantStatus } from '../overlay/review';
import { testChannel, testEngine } from '../testing';
import { openChannel, type TranslationStatus } from './host';
import { confirmMessage, loadStatus } from './status';

let server = testChannel();

function standing(locale: string, outdated: string[]): TranslationStatus {
  return {
    locale,
    coverage: 0.5,
    missing: 2,
    outdated: outdated.length,
    unreviewed: 0,
    sets: [{ scope: null, outdated, unreviewed: [] }],
  };
}

beforeEach(() => {
  server = testChannel();
  openChannel(server.channel);
  setEngine(testEngine({ writable: true }));
});

afterEach(() => {
  openChannel(null);
  setEngine(null);
  wantStatus(null);
  vi.restoreAllMocks();
});

describe('asking how a locale stands', () => {
  it('keeps what the dev server says for the panel and the overlay', async () => {
    const loading = loadStatus('en');

    server.answer('kroma:i18n:status', { status: standing('en', ['nav.home']), refused: null });
    await loading;

    expect(server.sent[0]).toMatchObject({ event: 'kroma:i18n:status', data: { locale: 'en' } });
    expect(heldStatus()).toMatchObject({ locale: 'en', outdated: 1 });
  });

  it('keeps nothing where the dev server refuses', async () => {
    const loading = loadStatus('de');

    server.answer('kroma:i18n:status', { status: null, refused: 'no catalog is kept for de' });
    await loading;

    expect(heldStatus()).toBeNull();
  });

  it('asks nothing for an engine that does not say it writes catalogs', async () => {
    setEngine(testEngine());

    await loadStatus('en');

    expect(server.sent).toEqual([]);
    expect(heldStatus()).toBeNull();
  });

  it('asks nothing before the engine has resolved a locale', async () => {
    await loadStatus('');

    expect(server.sent).toEqual([]);
  });

  it('keeps the answer for the locale asked last, whichever lands last', async () => {
    const first = loadStatus('en');
    const second = loadStatus('de');

    server.answer('kroma:i18n:status', { status: standing('de', []), refused: null }, 1);
    server.answer('kroma:i18n:status', { status: standing('en', ['nav.home']), refused: null }, 0);
    await Promise.all([first, second]);

    expect(heldStatus()?.locale).toBe('de');
  });
});

describe('confirming a translation from the page', () => {
  it('names the message to the dev server and reads the status again', async () => {
    const confirming = confirmMessage({ scope: 'tv.kroma.vpn', locale: 'en', key: 'vpn.connect' });

    server.answer('kroma:i18n:confirm', { settled: ['vpn.connect'], refused: null });
    await vi.waitFor(() => expect(server.sent).toHaveLength(2));
    server.answer('kroma:i18n:status', { status: standing('en', []), refused: null });
    await confirming;

    expect(server.sent[0]).toMatchObject({
      event: 'kroma:i18n:confirm',
      data: { scope: 'tv.kroma.vpn', locale: 'en', key: 'vpn.connect' },
    });
    expect(heldStatus()).toMatchObject({ locale: 'en', outdated: 0 });
  });

  it('leaves the status alone where nothing was settled', async () => {
    const confirming = confirmMessage({ scope: null, locale: 'en', key: 'nav.home' });

    server.answer('kroma:i18n:confirm', { settled: [], refused: null });
    await confirming;

    expect(server.sent).toHaveLength(1);
  });

  it('says why out loud where the dev server refuses', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const confirming = confirmMessage({ scope: null, locale: 'en', key: 'nav.gone' });

    server.answer('kroma:i18n:confirm', { settled: [], refused: 'nav.gone is not a message of core' });
    await confirming;

    expect(warned).toHaveBeenCalledWith(
      '[i18n] could not confirm nav.gone: nav.gone is not a message of core',
    );
  });
});
