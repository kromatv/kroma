import { expect, it } from 'vitest';
import { nativeLanguageName } from './native-language-name';

it('names a language in that language, with a capital', () => {
  expect(nativeLanguageName('fr')).toBe('Français');
  expect(nativeLanguageName('en')).toBe('English');
});
