// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  user: { audioLanguage: null, subtitleLanguage: null } as Record<string, string | null> | null,
  updateUser: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: H.user, updateUser: H.updateUser }),
}));
vi.mock('#tv/app/router', () => ({
  useClient: () => ({ updateAccount: H.updateAccount }),
}));

const { useLangPrefs } = await import('#tv/app/langPref');

beforeEach(() => {
  vi.clearAllMocks();
  H.user = { audioLanguage: null, subtitleLanguage: null };
  H.updateAccount.mockResolvedValue(undefined);
});

describe('useLangPrefs', () => {
  it('reads the preferences off the signed-in account', () => {
    H.user = { audioLanguage: 'fr-CA', subtitleLanguage: 'off' };
    const { result } = renderHook(() => useLangPrefs());
    expect(result.current.audio).toBe('fr-CA');
    expect(result.current.subtitle).toBe('off');
  });

  it('writes a change through the account, optimistically', () => {
    const { result } = renderHook(() => useLangPrefs());
    act(() => result.current.setAudio('fr'));
    expect(H.updateUser).toHaveBeenCalledWith({ audioLanguage: 'fr' });
    expect(H.updateAccount).toHaveBeenCalledWith({ audioLanguage: 'fr' });
  });

  it('swallows a failed PATCH rather than interrupting playback', async () => {
    H.updateAccount.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLangPrefs());
    act(() => result.current.setSubtitle('en'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(H.updateUser).toHaveBeenCalledWith({ subtitleLanguage: 'en' });
  });

  it('has nothing to read while signed out', () => {
    H.user = null;
    const { result } = renderHook(() => useLangPrefs());
    expect(result.current.audio).toBeNull();
    expect(result.current.subtitle).toBeNull();
  });
});
