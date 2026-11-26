import { describe, expect, it } from 'vitest';
import { catalogMessages, keyFinder } from './catalog';

const REPO = new URL('../../../..', import.meta.url).pathname;

const MESSAGES = new Map([
  ['de:monitoring.followed', 'Gefolgt'],
  ['de:about.cpuCores_other', '{count} Kerne'],
  ['de:nav.title', '$t(common.app) für {name}'],
  ['de:common.app', 'KROMA'],
  ['en:monitoring.followed', 'Followed'],
  ['en:monitoring.title', 'Monitoring'],
]);

describe('the catalog key of a text on screen', () => {
  const keyOf = keyFinder(MESSAGES);

  it('is the key of the message it reads as written', () => {
    expect(keyOf('Gefolgt')).toBe('de:monitoring.followed');
  });

  it('is the key of a message whose variables it fills', () => {
    expect(keyOf('8 Kerne')).toBe('de:about.cpuCores_other');
    expect(keyOf('KROMA für Salon')).toBe('de:nav.title');
  });

  it('is the key in the first language listed when two read the same', () => {
    const keyOfBoth = keyFinder(
      new Map([
        ['de:a', 'OK'],
        ['en:b', 'OK'],
      ]),
    );

    expect(keyOfBoth('OK')).toBe('de:a');
  });

  it('falls back to the source language a translation still shows', () => {
    expect(keyOf('Monitoring')).toBe('en:monitoring.title');
  });

  it('is nothing for a text only a message of variables would read', () => {
    const keyOfSlots = keyFinder(
      new Map([
        ['en:pair', '{name} {reasons}'],
        ['en:size', '{n} s'],
      ]),
    );

    expect(keyOfSlots('GET /api/admin/users')).toBeNull();
    expect(keyOfSlots('12 s')).toBeNull();
  });

  it('is nothing for a sentence that only shares a short message its words', () => {
    const keyOfList = keyFinder(new Map([['en:list', '{head} and {last}']]));

    expect(keyOfList('She starred in the film and the series ran for years')).toBeNull();
    expect(keyOfList('Films and series')).toBeNull();
    expect(keyOfList('A and B')).toBe('en:list');
  });

  it('is nothing for a text no catalog holds', () => {
    expect(keyOf('The Hunger Games: Sunrise on the Reaping')).toBeNull();
  });

  it('reads a message with a character a pattern would take as its own literally', () => {
    const keyOfPrice = keyFinder(new Map([['en:price', '{amount} (x2) [beta]?']]));

    expect(keyOfPrice('4 (x2) [beta]?')).toBe('en:price');
    expect(keyOfPrice('4 x2 beta')).toBeNull();
  });
});

describe('the messages of the product', () => {
  it('hold the core catalogs and the modules, under their language', () => {
    const messages = catalogMessages(REPO, ['en']);

    expect(messages.get('en:common.cancel')).toBe('Cancel');
    expect(messages.get('en:nav.vpn')).toBe('VPN');
  });

  it('hold nothing for a language with no catalog', () => {
    expect(catalogMessages(REPO, ['xx']).size).toBe(0);
  });
});
