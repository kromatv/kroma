import { expect, it } from 'vitest';
import { matchingChoices, orderedChoices, preferredCodes } from './language-choices';

const CHOICES = [
  { code: 'en', native: 'English', label: 'English' },
  { code: 'fr', native: 'Français', label: 'French' },
  { code: 'de', native: 'Deutsch', label: 'German' },
  { code: 'pt-BR', native: 'Português (Brasil)', label: 'Portuguese (Brazil)' },
  { code: 'es', native: 'Español', label: 'Spanish' },
];
const CODES = CHOICES.map((choice) => choice.code);

it('reads the languages a browser asks for, in its order, among the ones offered', () => {
  expect(preferredCodes(CODES, ['fr-CH', 'de', 'it'])).toEqual(['fr', 'de']);
});

it('gives a regional language to a browser that asks for the bare one', () => {
  expect(preferredCodes(CODES, ['pt'])).toEqual(['pt-BR']);
});

it('names a preferred language once, however often the browser lists it', () => {
  expect(preferredCodes(CODES, ['fr-CH', 'fr-FR', 'fr'])).toEqual(['fr']);
});

it('puts the preferred languages on top and sorts the others by their own name', () => {
  const ordered = orderedChoices(CHOICES, ['fr', 'de']);

  expect(ordered.map((choice) => choice.code)).toEqual(['fr', 'de', 'en', 'es', 'pt-BR']);
});

it('leaves out a preferred language that is not among the choices', () => {
  const ordered = orderedChoices(CHOICES, ['it', 'fr']);

  expect(ordered.map((choice) => choice.code)).toEqual(['fr', 'de', 'en', 'es', 'pt-BR']);
});

it('finds a language by its own name without the accent', () => {
  expect(matchingChoices(CHOICES, 'francais').map((choice) => choice.code)).toEqual(['fr']);
});

it('finds a language by its name in the language on screen, and by its code', () => {
  expect(matchingChoices(CHOICES, 'german').map((choice) => choice.code)).toEqual(['de']);
  expect(matchingChoices(CHOICES, 'pt-br').map((choice) => choice.code)).toEqual(['pt-BR']);
});

it('keeps every language while nothing is typed', () => {
  expect(matchingChoices(CHOICES, '  ')).toHaveLength(CHOICES.length);
});
