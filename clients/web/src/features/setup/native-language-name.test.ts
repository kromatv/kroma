import { afterEach, expect, it, vi } from 'vitest';
import { nativeLanguageName } from './native-language-name';

afterEach(() => {
  vi.restoreAllMocks();
});

it('names a language in that language, with a capital', () => {
  expect(nativeLanguageName('fr')).toBe('Français');
  expect(nativeLanguageName('en')).toBe('English');
});

it('names a language by its code on a device that has no name for it', () => {
  vi.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue(undefined);

  const name = nativeLanguageName('tlh');

  expect(name).toBe('Tlh');
});
