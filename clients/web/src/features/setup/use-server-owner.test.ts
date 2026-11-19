// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ client: { accounts: { config: vi.fn() } } }));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

import { useServerOwner } from './use-server-owner.hook';

const LATE_MS = 50;

function answerAfter(ms: number, config: { hasAccounts: boolean }) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(config), ms);
  });
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  auth.client = { accounts: { config: vi.fn() } };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('does not know whether the server has an owner before it has answered', () => {
  auth.client.accounts.config.mockReturnValue(new Promise(() => {}));

  const { result } = renderHook(() => useServerOwner());

  expect(result.current).toBe('unknown');
});

it('reads a server that holds an account as owned', async () => {
  auth.client.accounts.config.mockResolvedValue({ hasAccounts: true });

  const { result } = renderHook(() => useServerOwner());
  await elapse(0);

  expect(result.current).toBe('present');
});

it('reads a server that holds no account as waiting for its owner', async () => {
  auth.client.accounts.config.mockResolvedValue({ hasAccounts: false });

  const { result } = renderHook(() => useServerOwner());
  await elapse(0);

  expect(result.current).toBe('missing');
});

it('never reads a server that did not answer as an empty one', async () => {
  auth.client.accounts.config.mockRejectedValue(new Error('offline'));

  const { result } = renderHook(() => useServerOwner());
  await elapse(0);

  expect(result.current).toBe('unknown');
});

it('asks the server once, however often the screen draws', async () => {
  auth.client.accounts.config.mockResolvedValue({ hasAccounts: true });
  const { rerender } = renderHook(() => useServerOwner());
  await elapse(0);

  rerender();
  await elapse(0);

  expect(auth.client.accounts.config).toHaveBeenCalledOnce();
});

it('ignores the late answer of a server the screen left for another', async () => {
  auth.client.accounts.config.mockReturnValue(answerAfter(LATE_MS, { hasAccounts: true }));
  const { result, rerender } = renderHook(() => useServerOwner());
  auth.client = { accounts: { config: vi.fn() } };
  auth.client.accounts.config.mockResolvedValue({ hasAccounts: false });
  rerender();

  await elapse(LATE_MS);

  expect(result.current).toBe('missing');
});
