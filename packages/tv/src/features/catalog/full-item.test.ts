// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import type { MediaCard, MediaItem } from '@kromatv/client/media';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const item = vi.fn();
  const go = vi.fn();
  return { item, go, client: { media: { item } }, nav: { go } };
});
vi.mock('#tv/app/router', () => ({ useClient: () => H.client, useNav: () => H.nav }));

import { fullItem, useFullItem, usePlayTitle } from './full-item';

const CARD = { id: 'm1', title: 'Dune', kind: 'movie' } as MediaCard;
const DUNE = { ...CARD, files: [{ id: 'f1' }] } as unknown as MediaItem;

beforeEach(() => {
  vi.clearAllMocks();
  H.item.mockResolvedValue(DUNE);
});

it('hands back an item it already holds without asking the server', async () => {
  const item = await fullItem(H.client as unknown as KromaClient, DUNE);

  expect(item).toBe(DUNE);
  expect(H.item).not.toHaveBeenCalled();
});

it('fetches the item behind a card', async () => {
  const item = await fullItem(H.client as unknown as KromaClient, CARD);

  expect(item).toBe(DUNE);
  expect(H.item).toHaveBeenCalledWith('m1');
});

it('is nothing for a card until its item lands', () => {
  H.item.mockReturnValue(new Promise(() => undefined));

  const { result } = renderHook(() => useFullItem(CARD));

  expect(result.current).toBeNull();
});

it('is the item once it lands', async () => {
  const { result } = renderHook(() => useFullItem(CARD));

  await waitFor(() => expect(result.current).toBe(DUNE));
});

it('stays nothing when the item cannot be fetched', async () => {
  H.item.mockRejectedValue(new Error('gone'));

  const { result } = renderHook(() => useFullItem(CARD));

  await waitFor(() => expect(H.item).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

it('plays a card once its item has been fetched', async () => {
  const { result } = renderHook(() => usePlayTitle());

  result.current(CARD);

  await waitFor(() => expect(H.go).toHaveBeenCalledWith('player', { item: DUNE }));
});

it('opens no player when the item cannot be fetched', async () => {
  H.item.mockRejectedValue(new Error('gone'));
  const { result } = renderHook(() => usePlayTitle());

  result.current(CARD);
  await new Promise((settle) => setTimeout(settle, 0));

  expect(H.go).not.toHaveBeenCalled();
});
