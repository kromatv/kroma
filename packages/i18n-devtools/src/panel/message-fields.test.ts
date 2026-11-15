import { describe, expect, it } from 'vitest';
import type { CatalogMessage } from '../server/host';
import { changedForms, formLabel, messageFields } from './message-fields';

function message(over: Partial<CatalogMessage>): CatalogMessage {
  return { set: 'core', source: 'fr', reference: {}, forms: {}, variables: [], ...over };
}

const PLURAL = {
  'content.seasons_one': '{count} saison',
  'content.seasons_other': '{count} saisons',
};

describe('the fields a message is edited through', () => {
  it('is one field for a plain message, holding what the locale says', () => {
    const plain = message({ reference: { 'nav.home': 'Accueil' }, forms: { 'nav.home': 'Home' } });

    expect(messageFields('nav.home', plain)).toEqual([
      { form: 'nav.home', label: 'Text', text: 'Home' },
    ]);
  });

  it('is one field per plural form the locale writes', () => {
    const plural = message({
      reference: PLURAL,
      forms: {
        'content.seasons_one': '{count} season',
        'content.seasons_few': '{count} seasons',
        'content.seasons_other': '{count} seasons',
      },
    });

    expect(
      messageFields('content.seasons', plural).map(({ form, label }) => [form, label]),
    ).toEqual([
      ['content.seasons_one', 'one'],
      ['content.seasons_few', 'few'],
      ['content.seasons_other', 'other'],
    ]);
  });

  it('falls back to the forms of the source language, empty, where the locale has none yet', () => {
    const untranslated = message({ reference: PLURAL });

    expect(messageFields('content.seasons', untranslated)).toEqual([
      { form: 'content.seasons_one', label: 'one', text: '' },
      { form: 'content.seasons_other', label: 'other', text: '' },
    ]);
  });

  it('names a variant on another selector by everything after the key', () => {
    expect(formLabel('cart.items', 'cart.items_seats_one')).toBe('seats_one');
  });
});

describe('what a save has to write', () => {
  it('is only the texts that moved', () => {
    const fields = messageFields('content.seasons', message({ reference: PLURAL, forms: PLURAL }));

    const changed = changedForms(fields, {
      'content.seasons_one': '{count} saison',
      'content.seasons_other': '{count} saisons vues',
    });

    expect(changed).toEqual({ 'content.seasons_other': '{count} saisons vues' });
  });

  it('is nothing while no field was touched', () => {
    const fields = messageFields('nav.home', message({ forms: { 'nav.home': 'Home' } }));

    expect(changedForms(fields, {})).toEqual({});
  });
});
