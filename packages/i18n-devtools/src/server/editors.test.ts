// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInEditor, useEditors } from './editors';
import { type Channel, openChannel } from './host';

const sent: Array<{ event: string; data: { at: number } }> = [];
const heard = new Map<string, (answer: unknown) => void>();

const channel: Channel = {
  send: (event, data) => sent.push({ event, data: data as { at: number } }),
  on: (event, run) => heard.set(event, run),
};

function answer(event: string, data: object): void {
  heard.get(event)?.({ ...data, at: sent.at(-1)?.data.at });
}

beforeEach(() => {
  sent.length = 0;
  heard.clear();
  openChannel(channel);
});

afterEach(() => {
  openChannel(null);
  vi.restoreAllMocks();
});

describe('what this machine can open a file in', () => {
  it('is what the dev server reports', async () => {
    const { result } = renderHook(() => useEditors());

    answer('kroma:i18n:editors', { editors: [{ id: 'zed', name: 'Zed' }] });

    await waitFor(() => expect(result.current).toEqual([{ id: 'zed', name: 'Zed' }]));
  });

  it('is nothing until it answers', () => {
    const { result } = renderHook(() => useEditors());

    expect(result.current).toEqual([]);
  });

  it('is dropped where the panel is gone before the answer arrives', async () => {
    const { result, unmount } = renderHook(() => useEditors());

    unmount();
    answer('kroma:i18n:editors', { editors: [{ id: 'zed', name: 'Zed' }] });
    await Promise.resolve();

    expect(result.current).toEqual([]);
  });
});

describe('opening a file', () => {
  it('names the file and the editor the panel chose', () => {
    openInEditor('/src/who.tsx:42:1', 'zed');

    expect(sent[0]).toMatchObject({
      event: 'kroma:i18n:open',
      data: { file: '/src/who.tsx:42:1', editor: 'zed' },
    });
  });

  it('leaves the editor to the dev server when the panel has no preference', () => {
    openInEditor('/src/who.tsx:42:1', null);

    expect(sent[0]?.data).toMatchObject({ editor: null });
  });

  it('says so when it could not be opened', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    openInEditor('/src/who.tsx:42:1', 'zed');

    answer('kroma:i18n:open', { opened: false });

    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('who.tsx')));
  });

  it('says nothing when it was opened', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    openInEditor('/src/who.tsx:42:1', 'zed');

    answer('kroma:i18n:open', { opened: true });
    await Promise.resolve();

    expect(warn).not.toHaveBeenCalled();
  });
});
