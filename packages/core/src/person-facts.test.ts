import { describe, expect, it } from 'vitest';
import type { Translate } from './i18n';
import { departmentLabel, formatDay, personAge, personFacts } from './person-facts';

// Echoes the key with its interpolations, so a fact is asserted by key + vars.
const t: Translate = (key, vars) =>
  vars ? `${key}:${Object.values(vars).join(',')}` : String(key);

describe('personAge', () => {
  it('counts whole years up to today', () => {
    expect(personAge('1988-04-30', null, new Date(2026, 6, 23))).toBe(38);
  });

  it('has not counted this year when the birthday is still ahead', () => {
    expect(personAge('1988-12-31', null, new Date(2026, 6, 23))).toBe(37);
  });

  it('counts the birthday itself', () => {
    expect(personAge('1988-07-23', null, new Date(2026, 6, 23))).toBe(38);
  });

  it('stops at the death date, whatever today is', () => {
    expect(personAge('1930-08-25', '2014-08-11', new Date(2026, 6, 23))).toBe(83);
  });

  it('is null without a usable birth date', () => {
    expect(personAge(null)).toBeNull();
    expect(personAge('')).toBeNull();
    expect(personAge('sometime in 1988')).toBeNull();
  });
});

describe('formatDay', () => {
  it('reads a provider date as a local day, never a UTC instant', () => {
    // `new Date('1988-04-30')` is UTC midnight, which is the 29th in the
    // Americas; the whole point of the manual parse is that this stays the 30th.
    expect(formatDay('1988-04-30', 'en-US')).toBe('April 30, 1988');
  });

  it('writes it in the reader s locale', () => {
    expect(formatDay('1988-04-30', 'fr-FR')).toBe('30 avril 1988');
  });

  it('is null for a missing or unparseable date', () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay('unknown')).toBeNull();
  });
});

describe('personFacts', () => {
  it('gives a living person their age on the birth line', () => {
    const facts = personFacts(
      t,
      { birthday: '1988-04-30', placeOfBirth: 'Havana, Cuba', knownFor: 'Acting' },
      'en-US',
    );
    expect(facts.map((f) => f.key)).toEqual(['born', 'birthplace', 'knownFor']);
    expect(facts[0]?.value).toMatch(/^person\.bornAge:April 30, 1988,\d+$/);
    expect(facts[2]?.value).toBe('person.dept.acting');
  });

  it('moves the age onto the death line once there is one', () => {
    const facts = personFacts(t, { birthday: '1930-08-25', deathday: '2014-08-11' }, 'en-US');
    expect(facts.map((f) => f.key)).toEqual(['born', 'died']);
    // The birth line is a plain date: "(83 years old)" would read as still living.
    expect(facts[0]?.value).toBe('August 25, 1930');
    expect(facts[1]?.value).toBe('person.diedAge:August 11, 2014,83');
  });

  it('omits every fact the provider left blank, and is empty without a profile', () => {
    expect(personFacts(t, { biography: 'A life.' })).toEqual([]);
    expect(personFacts(t, null)).toEqual([]);
  });
});

describe('departmentLabel', () => {
  it('translates the departments we know', () => {
    expect(departmentLabel(t, 'Directing')).toBe('person.dept.directing');
  });

  it('shows an untranslated department verbatim, and nothing at all for none', () => {
    expect(departmentLabel(t, 'Visual Effects')).toBe('Visual Effects');
    expect(departmentLabel(t, null)).toBeNull();
    expect(departmentLabel(t, '')).toBeNull();
  });
});
