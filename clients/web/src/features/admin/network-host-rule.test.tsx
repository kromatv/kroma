// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES_VIEW } from '#web/features/admin/network.fixture';
import { useHostRule } from '#web/features/admin/network-host-rule';

const api = vi.hoisted(() => ({
  rules: vi.fn(),
  saveRules: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { network: { rules: api.rules, saveRules: api.saveRules } } }),
}));

vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  useConfirm: () => api.confirm,
}));

let queries: QueryClient;

function wrapper({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <QueryClientProvider client={queries}>
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<>{children}</>)}
      </KitProvider>
    </QueryClientProvider>
  );
}

const saved = () => api.saveRules.mock.calls[0]?.[0];

beforeEach(() => {
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.rules.mockReset().mockResolvedValue(RULES_VIEW);
  api.saveRules.mockReset().mockResolvedValue(undefined);
  api.confirm.mockReset().mockResolvedValue(true);
});

describe('writing a rule for one host', () => {
  it('asks first, then puts the block at the head of the stored list and refreshes the page', async () => {
    const refreshed = vi.spyOn(queries, 'invalidateQueries');
    const { result } = renderHook(() => useHostRule(), { wrapper });

    await act(() => result.current.apply('tracker.example.org', 'block'));

    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(saved().rules[0]).toMatchObject({ host: 'tracker.example.org', action: 'block' });
    expect(saved().rules.slice(1)).toEqual(RULES_VIEW.rules);
    expect(saved()).not.toHaveProperty('purposes');
    expect(refreshed).toHaveBeenCalledWith({ queryKey: ['admin', 'network'] });
    expect(result.current.error).toBeNull();
  });

  it('sends a host through the VPN without the destructive warning', async () => {
    const { result } = renderHook(() => useHostRule(), { wrapper });

    await act(() => result.current.apply('tracker.example.org', 'vpn'));

    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: false }));
    expect(saved().rules[0]).toMatchObject({ host: 'tracker.example.org', action: 'vpn' });
  });

  it('reads the stored list at the moment of writing, so an edit saved elsewhere is kept', async () => {
    const elsewhere = { ...RULES_VIEW, defaultAction: 'block' as const };
    api.rules.mockResolvedValue(elsewhere);
    const { result } = renderHook(() => useHostRule(), { wrapper });

    await act(() => result.current.apply('tracker.example.org', 'block'));

    expect(saved().defaultAction).toBe('block');
  });

  it('writes nothing when the operator cancels', async () => {
    api.confirm.mockResolvedValue(false);
    const { result } = renderHook(() => useHostRule(), { wrapper });

    await act(() => result.current.apply('tracker.example.org', 'block'));

    expect(api.rules).not.toHaveBeenCalled();
    expect(api.saveRules).not.toHaveBeenCalled();
  });

  it('says so when the server refuses the list', async () => {
    api.saveRules.mockRejectedValue(new Error('refused'));
    const { result } = renderHook(() => useHostRule(), { wrapper });

    await act(() => result.current.apply('tracker.example.org', 'block'));

    expect(result.current.error).not.toBeNull();
    expect(result.current.busy).toBe(false);
  });
});
