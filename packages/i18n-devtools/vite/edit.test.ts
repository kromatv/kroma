import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { editMessage } from './edit.ts';
import { app, read, removeSets, vpn } from './sets.fixture.ts';

afterEach(removeSets);

describe('saving an edited message', () => {
  it('writes the translation and says which keys it wrote', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}' },
    });

    expect(answer).toEqual({ written: ['nav.hello'], refused: null });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home', 'nav.hello': 'Hello {name}' });
  });

  it('puts a translation in the file the source language keeps the message in', () => {
    const set = app();

    editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'admin.backup.run',
      forms: { 'admin.backup.run': 'Back up' },
    });

    expect(read(set, 'en/admin/backup.json')).toEqual({ 'admin.backup.run': 'Back up' });
  });

  it('writes each plural form under its own key', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'content.seasons',
      forms: {
        'content.seasons_one': '{count} season',
        'content.seasons_other': '{count} seasons',
      },
    });

    expect(answer.written).toEqual(['content.seasons_one', 'content.seasons_other']);
    expect(read(set, 'en/content.json')).toEqual({
      'content.seasons_one': '{count} season',
      'content.seasons_other': '{count} seasons',
    });
  });

  it('records the translation in the lock of its locale', () => {
    const set = app();

    editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}' },
    });

    expect(readFileSync(join(set.dir, 'en/i18n.lock'), 'utf8')).toContain('nav.hello');
  });

  it('removes a translation whose text was emptied', () => {
    const set = app();

    editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.home',
      forms: { 'nav.home': '' },
    });

    expect(existsSync(join(set.dir, 'en/nav.json'))).toBe(false);
  });

  it('rewrites a message of the source language in place', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'fr',
      key: 'nav.home',
      forms: { 'nav.home': 'Maison' },
    });

    expect(answer.refused).toBeNull();
    expect(read(set, 'fr/nav.json')).toEqual({
      'nav.home': 'Maison',
      'nav.hello': 'Bonjour {name}',
    });
  });

  it('refuses to leave a message of the source language without its text', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'fr',
      key: 'nav.home',
      forms: { 'nav.home': ' ' },
    });

    expect(answer.refused).toContain('fr is the source language');
    expect(read(set, 'fr/nav.json')['nav.home']).toBe('Accueil');
  });

  it('writes to the module a scope names', () => {
    const module = vpn();

    const answer = editMessage(() => [app(), module], {
      scope: 'tv.kroma.vpn',
      locale: 'fr',
      key: 'vpn.connect',
      forms: { 'vpn.connect': 'Se connecter' },
    });

    expect(answer.refused).toBeNull();
    expect(read(module, 'fr.json')).toEqual({ 'vpn.connect': 'Se connecter' });
  });

  it('refuses a scope no catalog set answers to', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: 'tv.kroma.gone',
      locale: 'en',
      key: 'nav.home',
      forms: { 'nav.home': 'House' },
    });

    expect(answer).toEqual({ written: [], refused: 'no catalogs are known for tv.kroma.gone' });
  });

  it('refuses a key the source language has no message for', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.gone',
      forms: { 'nav.gone': 'Gone' },
    });

    expect(answer).toEqual({ written: [], refused: 'nav.gone is not a message of core' });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a locale the set keeps no catalog for', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'de',
      key: 'nav.home',
      forms: { 'nav.home': 'Start' },
    });

    expect(answer).toEqual({ written: [], refused: 'core has no catalog for de' });
    expect(existsSync(join(set.dir, 'de'))).toBe(false);
  });

  it('refuses a placeholder the source message never names', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.hello': 'Hello {name}, {count} new' },
    });

    expect(answer).toEqual({ written: [], refused: 'nav.hello is never given {count}' });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a text written under the key of another message', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.hello',
      forms: { 'nav.home': 'House' },
    });

    expect(answer).toEqual({ written: [], refused: 'nav.home is not a form of nav.hello' });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a payload past the size bound before reading any of it', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.home',
      forms: { 'nav.home': 'x'.repeat(60_000) },
    });

    expect(answer).toEqual({ written: [], refused: 'the request is too large' });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });

  it('refuses a single text longer than a message may be', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.home',
      forms: { 'nav.home': 'x'.repeat(2001) },
    });

    expect(answer.refused).toContain('malformed');
  });

  it('refuses an edit that carries no text', () => {
    const set = app();

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.home',
      forms: {},
    });

    expect(answer.refused).toContain('no form to write');
  });

  it('says why where the catalogs cannot be read', () => {
    const set = app();
    writeFileSync(join(set.dir, 'en/nav.json'), '[]');

    const answer = editMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'nav.home',
      forms: { 'nav.home': 'House' },
    });

    expect(answer.refused).toContain('is not a flat map of strings');
  });
});
