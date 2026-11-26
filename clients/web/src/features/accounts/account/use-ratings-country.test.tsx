// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRatingsCountry } from './use-ratings-country.hook';

const STORED = { country: null, household: 'CH', countries: ['DE', 'FR'] };

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { accounts: { ratings: { get: mocks.get, set: mocks.set } } } }),
}));

function mount(options?: { enabled?: boolean }) {
  const queries = new QueryClient();
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queries}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRatingsCountry(options), { wrapper }).result;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useRatingsCountry', () => {
  it('reads whose ratings the account shows', async () => {
    mocks.get.mockResolvedValue(STORED);

    const result = mount();

    await waitFor(() => expect(result.current.ratings).toEqual(STORED));
  });

  it('asks the server nothing while it is not wanted', () => {
    mount({ enabled: false });

    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('saves the server’s country as no country of the account’s own', async () => {
    mocks.get.mockResolvedValue(STORED);
    mocks.set.mockResolvedValue(STORED);
    const result = mount();

    await act(() => result.current.choose('household'));

    expect(mocks.set).toHaveBeenCalledWith(null);
  });

  it('saves a country by its code, and shows what the server answered', async () => {
    mocks.get.mockResolvedValue(STORED);
    mocks.set.mockResolvedValue({ ...STORED, country: 'DE' });
    const result = mount();
    await waitFor(() => expect(result.current.ratings).toEqual(STORED));

    await act(() => result.current.choose('DE'));

    expect(mocks.set).toHaveBeenCalledWith('DE');
    await waitFor(() => expect(result.current.ratings?.country).toBe('DE'));
  });
});
