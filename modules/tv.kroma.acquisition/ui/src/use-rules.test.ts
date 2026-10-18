// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlocklist, useCutoffTitles, useRules, useTitleRules } from './use-rules';

const acquisition = {
  rules: vi.fn(() => 'rules'),
  cutoff: vi.fn(() => 'cutoff'),
  blocklist: vi.fn(() => 'blocklist'),
  titleRules: vi.fn(() => 'title'),
};
const useFetch = vi.fn();
const usePoll = vi.fn();

vi.mock('@kromatv/module-sdk', () => ({
  useFetch: (...args: unknown[]) => useFetch(...args),
  usePoll: (...args: unknown[]) => usePoll(...args),
}));
vi.mock('./api', () => ({ useAcquisitionApi: () => acquisition }));

beforeEach(() => {
  useFetch.mockReset();
  usePoll.mockReset();
});

describe('the acquisition data hooks', () => {
  it('fetches the rules under an admin key', () => {
    renderHook(() => useRules());

    const [key, fetcher] = useFetch.mock.calls[0] ?? [];
    expect(key).toEqual(['admin', 'acquisition', 'rules']);
    expect(fetcher()).toBe('rules');
  });

  it('polls the cutoff list every minute', () => {
    renderHook(() => useCutoffTitles());

    const [key, fetcher, every] = usePoll.mock.calls[0] ?? [];
    expect(key).toEqual(['admin', 'acquisition', 'cutoff']);
    expect(fetcher()).toBe('cutoff');
    expect(every).toBe(60_000);
  });

  it('polls the blocklist every minute', () => {
    renderHook(() => useBlocklist());

    const [key, fetcher, every] = usePoll.mock.calls[0] ?? [];
    expect(key).toEqual(['admin', 'acquisition', 'blocklist']);
    expect(fetcher()).toBe('blocklist');
    expect(every).toBe(60_000);
  });

  it('fetches one title rules under a key that names the title', () => {
    renderHook(() => useTitleRules('show', 5));

    const [key, fetcher] = useFetch.mock.calls[0] ?? [];
    expect(key).toEqual(['admin', 'acquisition', 'title', 'show', 5]);
    expect(fetcher()).toBe('title');
    expect(acquisition.titleRules).toHaveBeenCalledWith('show', 5);
  });
});
