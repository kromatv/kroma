// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tags: ['en-US'],
  prefs: new Map<string, string>(),
  setSystemLanguage: vi.fn(async (_tag: string) => undefined),
}));

vi.mock('expo-localization', () => ({
  useLocales: () => state.tags.map((languageTag) => ({ languageTag })),
}));
vi.mock('./storage', () => ({
  loadPref: async (key: string) => state.prefs.get(key) ?? null,
  savePref: async (key: string, value: string) => {
    state.prefs.set(key, value);
  },
}));
vi.mock('../../modules/app-language', () => ({
  setSystemLanguage: state.setSystemLanguage,
}));

const { useLanguageChoice } = await import('./language-choice.hook');

function launch({ ready = true } = {}) {
  const onChoose = vi.fn();
  const view = renderHook(
    (props: { ready: boolean }) => useLanguageChoice({ ...props, onChoose }),
    {
      initialProps: { ready },
    },
  );
  return { ...view, onChoose };
}

beforeEach(() => {
  state.tags = ['en-US'];
  state.prefs = new Map();
  state.setSystemLanguage.mockReset();
  state.setSystemLanguage.mockResolvedValue(undefined);
});

describe('a language picked in the system settings', () => {
  it('is followed at the next launch, told and kept', async () => {
    state.prefs.set('locale', 'en');
    state.prefs.set('systemLocale', 'en');
    state.tags = ['fr-FR', 'en-US'];

    const { result, onChoose } = launch();

    await waitFor(() => expect(state.prefs.get('systemLocale')).toBe('fr'));
    expect(result.current.chosen).toBe('fr');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('fr');
    expect(state.prefs.get('locale')).toBe('fr');
    expect(state.setSystemLanguage).not.toHaveBeenCalled();
  });

  it('waits for the session before it is followed', async () => {
    state.prefs.set('locale', 'en');
    state.prefs.set('systemLocale', 'en');
    state.tags = ['de-DE'];
    const { result, rerender, onChoose } = launch({ ready: false });
    await act(async () => undefined);
    const before = result.current.chosen;

    rerender({ ready: true });

    expect(before).toBe('en');
    await waitFor(() => expect(result.current.chosen).toBe('de'));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('de');
  });

  it('is followed when it changes while the app runs', async () => {
    state.prefs.set('locale', 'en');
    state.prefs.set('systemLocale', 'en');
    const { result, rerender, onChoose } = launch();
    await act(async () => undefined);

    state.tags = ['ja-JP'];
    rerender({ ready: true });

    await waitFor(() => expect(result.current.chosen).toBe('ja'));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('ja');
  });

  it('is read past the languages the product does not offer', async () => {
    state.prefs.set('systemLocale', 'en');
    state.tags = ['it-IT', 'fr-FR'];

    const { result } = launch();

    await waitFor(() => expect(result.current.system).toBe('fr'));
  });
});

describe('the first launch that compares the two', () => {
  it('only remembers the system language, and hands it the language picked before', async () => {
    state.prefs.set('locale', 'en');
    state.tags = ['fr-FR'];

    const { result, onChoose } = launch();

    await waitFor(() => expect(state.prefs.get('systemLocale')).toBe('fr'));
    expect(result.current.chosen).toBe('en');
    expect(onChoose).not.toHaveBeenCalled();
    expect(state.setSystemLanguage).toHaveBeenCalledWith('en');
  });
});

describe('a language picked in the app', () => {
  it('is kept, told and handed to the system', async () => {
    state.prefs.set('locale', 'en');
    state.prefs.set('systemLocale', 'en');
    const { result, onChoose } = launch();
    await act(async () => undefined);

    act(() => result.current.choose('de'));

    expect(result.current.chosen).toBe('de');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('de');
    await waitFor(() => expect(state.setSystemLanguage).toHaveBeenCalledWith('de'));
    expect(state.prefs.get('locale')).toBe('de');
  });

  it('stays picked when the system refuses it', async () => {
    state.setSystemLanguage.mockRejectedValue(new Error('refused'));
    state.prefs.set('systemLocale', 'en');
    const { result } = launch();
    await act(async () => undefined);

    act(() => result.current.choose('ko'));

    await waitFor(() => expect(state.setSystemLanguage).toHaveBeenCalledWith('ko'));
    expect(result.current.chosen).toBe('ko');
  });

  it('is kept when it comes before the stored choice is read', async () => {
    state.prefs.set('locale', 'en');
    const { result } = launch({ ready: false });

    act(() => result.current.choose('pt'));
    await act(async () => undefined);

    expect(result.current.chosen).toBe('pt');
  });
});
