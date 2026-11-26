import type { Translate } from '@kromatv/i18n';
import { describe, expect, it, vi } from 'vitest';
import {
  type ChoicePreference,
  choiceCommand,
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

const values = (pref: ChoicePreference) =>
  (choiceCommand(pref, t).items ?? []).flatMap((one) => (one ? [one] : []));

const blur = (reach: SwitchPreference['reach'], setOn = vi.fn()): SwitchPreference => ({
  id: 'blur',
  label: 'Background blur',
  icon: 'blur',
  keywords: 'flou',
  reach,
  setOn,
});

describe('a preference that takes one value of a list', () => {
  it('stands as one row that says the value in use and opens the account page on it', () => {
    expect(choiceCommand(languages(), t)).toMatchObject({
      label: 'Interface language',
      meta: 'Français',
      flag: 'FR',
      to: '/account',
      search: { section: 'preferences' },
    });
  });

  it('lists each value with its flag, its own name and the language that name is in', () => {
    expect(values(languages())[0]).toMatchObject({
      label: 'Deutsch',
      subtitle: 'German',
      flag: 'DE',
      lang: 'de',
      primaryLabel: 'commands.choose',
    });
  });

  it('marks the value in use, and only that one', () => {
    const [german, french] = values(languages());

    expect(french?.status).toEqual({ label: 'commands.current', tone: 'success' });
    expect(german?.status).toBeUndefined();
  });

  it('picks a value when its row runs', () => {
    const pick = vi.fn();

    void values(languages(pick))[0]?.run?.();

    expect(pick).toHaveBeenCalledWith('de');
  });

  it('gives every value an id of its own', () => {
    const ids = values(languages()).map((row) => row.id);

    expect(new Set(ids).size).toBe(2);
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
