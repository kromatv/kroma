// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state: { locale: string; system: string | null; openSettings: () => Promise<void> } =
  vi.hoisted(() => ({ locale: 'de', system: 'fr', openSettings: vi.fn(async () => undefined) }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Linking: { openSettings: state.openSettings },
}));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key} ${Object.values(vars).join(' ')}` : key,
  useI18n: () => ({ locale: state.locale, system: state.system }),
}));
vi.mock('../../modules/app-language', () => ({ systemLanguageReach: 'open' }));

const { SystemLanguageNote } = await import('./system-language-note.component');

afterEach(cleanup);

describe('the note under the language list', () => {
  it('names the language the device settings still hold, in its own name', () => {
    state.locale = 'de';
    state.system = 'fr';

    render(<SystemLanguageNote />);

    expect(screen.getByText('account.uiLanguageInSettings Français')).toBeTruthy();
  });

  it('opens the device settings', () => {
    state.locale = 'de';
    state.system = 'fr';
    render(<SystemLanguageNote />);

    fireEvent.click(screen.getByText('account.uiLanguageOpenSettings'));

    expect(state.openSettings).toHaveBeenCalledOnce();
  });

  it('says nothing when the device settings hold the language on screen', () => {
    state.locale = 'fr';
    state.system = 'fr';

    render(<SystemLanguageNote />);

    expect(screen.queryByText(/account\.uiLanguageInSettings/)).toBeNull();
  });
});
