import { describe, expect, it } from 'vitest';
import { languageToChangeInSettings, syncLanguage } from './language-sync';

describe('comparing the system language with the one picked here', () => {
  it('only remembers the system language the first time it looks', () => {
    expect(syncLanguage({ system: 'fr', lastSeen: null, chosen: null })).toEqual({
      remember: 'fr',
      follow: null,
      hand: null,
    });
  });

  it('hands the system a language picked before it ever looked', () => {
    expect(syncLanguage({ system: 'fr', lastSeen: null, chosen: 'en' })).toEqual({
      remember: 'fr',
      follow: null,
      hand: 'en',
    });
  });

  it('follows the system when its language moved since it last looked', () => {
    expect(syncLanguage({ system: 'de', lastSeen: 'fr', chosen: 'fr' })).toEqual({
      remember: 'de',
      follow: 'de',
      hand: null,
    });
  });

  it('only remembers a move to the language already picked here', () => {
    expect(syncLanguage({ system: 'de', lastSeen: 'fr', chosen: 'de' })).toEqual({
      remember: 'de',
      follow: null,
      hand: null,
    });
  });

  it('hands the system a language picked here while its own stayed put', () => {
    expect(syncLanguage({ system: 'fr', lastSeen: 'fr', chosen: 'ja' })).toEqual({
      remember: null,
      follow: null,
      hand: 'ja',
    });
  });

  it('has nothing to do when both agree', () => {
    expect(syncLanguage({ system: 'fr', lastSeen: 'fr', chosen: 'fr' })).toEqual({
      remember: null,
      follow: null,
      hand: null,
    });
  });

  it('never follows a system that asks for no language the product offers', () => {
    expect(syncLanguage({ system: null, lastSeen: 'fr', chosen: 'fr' })).toEqual({
      remember: null,
      follow: null,
      hand: 'fr',
    });
  });
});

describe('the language left to change in the device settings', () => {
  it('is the one the settings hold when only the user can change it there', () => {
    expect(languageToChangeInSettings('open', { system: 'fr', locale: 'de' })).toBe('fr');
  });

  it('is none when the settings hold the language on screen', () => {
    expect(languageToChangeInSettings('open', { system: 'de', locale: 'de' })).toBeNull();
  });

  it('is none where the app sets the system language itself', () => {
    expect(languageToChangeInSettings('set', { system: 'fr', locale: 'de' })).toBeNull();
  });

  it('is none where the system keeps no language for the app', () => {
    expect(languageToChangeInSettings('none', { system: 'fr', locale: 'de' })).toBeNull();
  });

  it('is none when the system asks for no language the product offers', () => {
    expect(languageToChangeInSettings('open', { system: null, locale: 'de' })).toBeNull();
  });
});
