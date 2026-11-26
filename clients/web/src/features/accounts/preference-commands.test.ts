import type { Translate } from '@kromatv/i18n';
import { describe, expect, it, vi } from 'vitest';
import {
  type ChoicePreference,
  choiceRows,
  listedRows,
  namesPreference,
  type PreferenceRows,
  type SwitchPreference,
  switchRow,
} from './preference-commands';

const t: Translate = (key: string, _vars?: unknown) => key;

const languages = (pick = vi.fn()): ChoicePreference => ({
  id: 'locale',
  name: 'Interface language',
  icon: 'language',
  keywords: 'langue',
  current: 'fr',
  choices: [
    {
      value: 'de',
      label: 'Deutsch',
      subtitle: 'German',
      flag: 'DE',
      lang: 'de',
      pick: () => pick('de'),
    },
    { value: 'fr', label: 'Français', flag: 'FR', lang: 'fr', pick: () => pick('fr') },
  ],
});

const head = { label: 'Head', run: () => {} };

const rows = (count: number): PreferenceRows => ({
  head,
  values: Array.from({ length: count }, (_, at) => ({ label: `value ${at}`, run: () => {} })),
  words: 'Preferred audio language audio son',
});

const blur = (reach: SwitchPreference['reach'], setOn = vi.fn()): SwitchPreference => ({
  id: 'blur',
  label: 'Background blur',
  icon: 'blur',
  keywords: 'flou',
  reach,
  setOn,
});

describe('namesPreference', () => {
  it('finds a preference by a word of what is typed', () => {
    expect(namesPreference('english audio', 'Preferred audio language')).toBe(true);
  });

  it('finds it by the start of a word', () => {
    expect(namesPreference('sous', 'Langue de sous-titres préférée')).toBe(true);
  });

  it('ignores a word too short to name anything', () => {
    expect(namesPreference('au', 'Preferred audio language')).toBe(false);
  });

  it('does not read scattered letters as a name', () => {
    expect(namesPreference('pdl', 'Preferred audio language')).toBe(false);
  });
});

describe('listedRows', () => {
  it('lists only the head with nothing typed', () => {
    expect(listedRows(rows(3), '')).toEqual([head]);
  });

  it('lists a short list as soon as something is typed', () => {
    expect(listedRows(rows(3), 'x')).toHaveLength(4);
  });

  it('holds back a long list the query does not name', () => {
    expect(listedRows(rows(40), 'english')).toEqual([head]);
  });

  it('lists a long list once the query names it', () => {
    expect(listedRows(rows(40), 'english audio')).toHaveLength(41);
  });

  it('lists nothing in place of a missing head', () => {
    expect(listedRows({ ...rows(0), head: null }, '')).toEqual([]);
  });
});

describe('a preference that takes one value of a list', () => {
  it('stands as one row that says the value in use and opens the account page on it', () => {
    expect(choiceRows(languages(), t).head).toMatchObject({
      label: 'Interface language',
      meta: 'Français',
      flag: 'FR',
      to: '/account',
      search: { section: 'preferences' },
    });
  });

  it('lists each value with its flag, its own name and the language that name is in', () => {
    expect(choiceRows(languages(), t).values[0]).toMatchObject({
      label: 'Deutsch',
      subtitle: 'German',
      flag: 'DE',
      lang: 'de',
      meta: 'Interface language',
      primaryLabel: 'commands.choose',
    });
  });

  it('marks the value in use, and only that one', () => {
    const [german, french] = choiceRows(languages(), t).values;

    expect(french?.status).toEqual({ label: 'commands.current', tone: 'success' });
    expect(german?.status).toBeUndefined();
  });

  it('picks a value when its row runs', () => {
    const pick = vi.fn();

    void choiceRows(languages(pick), t).values[0]?.run?.();

    expect(pick).toHaveBeenCalledWith('de');
  });

  it('gives every value an id of its own', () => {
    const ids = choiceRows(languages(), t).values.map((row) => row.id);

    expect(new Set(ids).size).toBe(2);
  });

  it('is named by its name and its keywords', () => {
    expect(choiceRows(languages(), t).words).toBe('Interface language langue');
  });
});

describe('a switch', () => {
  it('says it is on and turns off', () => {
    const setOn = vi.fn();
    const row = switchRow(blur({ on: 1, of: 1 }, setOn), t);

    void row.run?.();

    expect(row.status).toEqual({ label: 'commands.on', tone: 'success' });
    expect(row.primaryLabel).toBe('commands.turnOff');
    expect(setOn).toHaveBeenCalledWith(false);
  });

  it('says it is off and turns on', () => {
    const setOn = vi.fn();
    const row = switchRow(blur({ on: 0, of: 1 }, setOn), t);

    void row.run?.();

    expect(row.status).toEqual({ label: 'commands.off', tone: 'neutral' });
    expect(row.primaryLabel).toBe('commands.turnOn');
    expect(setOn).toHaveBeenCalledWith(true);
  });

  it('says it reaches only part of what it speaks for, and turns on for all of it', () => {
    const setOn = vi.fn();
    const row = switchRow(blur({ on: 1, of: 3 }, setOn), t);

    void row.run?.();

    expect(row.status).toEqual({ label: 'commands.partly', tone: 'neutral' });
    expect(setOn).toHaveBeenCalledWith(true);
  });
});
