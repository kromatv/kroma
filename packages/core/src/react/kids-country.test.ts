// @vitest-environment jsdom

import type { RatingsCountry } from '@kromatv/client/accounts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useKidsCountry } from './kids-country.hook';

const swiss: RatingsCountry = { country: 'CH', household: 'FR', countries: ['CH', 'DE', 'FR'] };

describe("a Kids form's ratings country", () => {
  it("starts on the admin's own country once it is read", async () => {
    const { result } = renderHook(() => useKidsCountry(() => Promise.resolve(swiss)));

    expect(result.current.country).toBeNull();
    await waitFor(() => expect(result.current.country).toBe('CH'));
    expect(result.current.countries).toEqual(['CH', 'DE', 'FR']);
  });

  it('keeps the country the admin picks', async () => {
    const { result } = renderHook(() => useKidsCountry(() => Promise.resolve(swiss)));
    await waitFor(() => expect(result.current.country).toBe('CH'));

    act(() => result.current.pick('DE'));

    expect(result.current.country).toBe('DE');
  });

  it("leaves the server to give the admin's own when it cannot be read", async () => {
    const { result } = renderHook(() => useKidsCountry(() => Promise.reject(new Error('down'))));

    await act(() => Promise.resolve());

    expect(result.current.country).toBeNull();
    expect(result.current.countries).toEqual([]);
  });
});
