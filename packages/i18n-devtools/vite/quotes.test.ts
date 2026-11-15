import { afterEach, describe, expect, it } from 'vitest';
import { editMessage } from './edit.ts';
import { app, read, removeSets, vpn } from './sets.fixture.ts';

afterEach(removeSets);

describe('quoting another message in an edited text', () => {
  it('writes a text that quotes a message of its own file', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}, welcome $t(nav.home)' },
    });

    expect(answer).toEqual({ written: ['nav.hello'], refused: null });
    expect(read(set, 'en/nav.json')['nav.hello']).toBe('Hello {name}, welcome $t(nav.home)');
  });

  it('refuses a text that quotes a key the source language has no message for', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}, $t(nav.gone)' },
    });

    expect(answer).toEqual({
      written: [],
      refused: 'nav.hello quotes nav.gone, which is no message of core',
    });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a text that quotes a message kept in another catalog file', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}, $t( admin.backup.run )' },
    });

    expect(answer).toEqual({
      written: [],
      refused:
        'nav.hello quotes admin.backup.run, which is kept in another file: a message only quotes its own',
    });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a quote of something every object has but no catalog writes', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': '$t(constructor)' },
    });

    expect(answer.refused).toBe('nav.hello quotes constructor, which is no message of core');
  });

  it('holds a plural variant only the translation has to the file of its message', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'content.seasons',
      forms: { 'content.seasons_few': '{count} seasons, $t(nav.home)' },
    });

    expect(answer.refused).toBe(
      'content.seasons_few quotes nav.home, which is kept in another file: a message only quotes its own',
    );
  });

  it('lets a module, which keeps one file per locale, quote any of its messages', () => {
    const module = vpn();

    const answer = editMessage(() => [module], {
      scope: 'tv.kroma.vpn',
      locale: 'fr',
      key: 'vpn.connect',
      forms: { 'vpn.connect': 'Connecter, $t(vpn.connect)' },
    });

    expect(answer.refused).toBeNull();
  });
});
