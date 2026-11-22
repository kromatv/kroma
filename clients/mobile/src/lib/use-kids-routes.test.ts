// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useKidsRoutes } from './use-kids-routes.hook';

interface Mocks {
  replace: Mock;
  pathname: string;
  user: { kids?: boolean } | null;
}

const mocks: Mocks = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/', user: null }));

vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('#mobile/lib/session', () => ({ useSession: () => ({ user: mocks.user }) }));

afterEach(() => {
  vi.clearAllMocks();
  mocks.pathname = '/';
  mocks.user = null;
});

describe('the screens a Kids session reaches on the phone', () => {
  it('sends it back to the tabs from its account settings', () => {
    mocks.user = { kids: true };
    mocks.pathname = '/edit-profile';

    renderHook(() => useKidsRoutes());

    expect(mocks.replace).toHaveBeenCalledWith('/(app)/(tabs)');
  });

  it('leaves it on the catalogue', () => {
    mocks.user = { kids: true };
    mocks.pathname = '/search';

    renderHook(() => useKidsRoutes());

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('leaves any other session on its account settings', () => {
    mocks.user = { kids: false };
    mocks.pathname = '/edit-profile';

    renderHook(() => useKidsRoutes());

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
