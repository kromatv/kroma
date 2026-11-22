// @vitest-environment jsdom

import { askForKidsProfile, dropKidsProfileAsk, kidsProfileAsked } from '@kromatv/core';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useAskedKidsForm } from './use-asked-kids-form.hook';

interface Mocks {
  push: Mock;
  user: { id: string } | null;
}

const mocks: Mocks = vi.hoisted(() => ({ push: vi.fn(), user: null }));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('#mobile/lib/session', () => ({ useSession: () => ({ user: mocks.user }) }));

afterEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  dropKidsProfileAsk();
});

describe('the Kids profile form asked for from the gate', () => {
  it('opens once the admin who asked is in, and is then forgotten', () => {
    askForKidsProfile('max');
    mocks.user = { id: 'max' };

    renderHook(() => useAskedKidsForm());

    expect(mocks.push).toHaveBeenCalledWith('/(app)/add-kids');
    expect(kidsProfileAsked('max')).toBe(false);
  });

  it('stays closed for anyone else, and keeps waiting for the admin', () => {
    askForKidsProfile('max');
    mocks.user = { id: 'ana' };

    renderHook(() => useAskedKidsForm());

    expect(mocks.push).not.toHaveBeenCalled();
    expect(kidsProfileAsked('max')).toBe(true);
  });

  it('stays closed before anyone is in', () => {
    askForKidsProfile('max');

    renderHook(() => useAskedKidsForm());

    expect(mocks.push).not.toHaveBeenCalled();
  });
});
