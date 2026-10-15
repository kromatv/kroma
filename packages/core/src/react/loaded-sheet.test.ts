// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLoadedSheet } from './loaded-sheet';

interface Sheet {
  url: string;
  ready: string;
}

const V1: Sheet = { url: 'http://kroma.test/sheet.jpg?v=1', ready: '1100' };
const V2: Sheet = { url: 'http://kroma.test/sheet.jpg?v=2', ready: '1110' };

const settle = () => act(async () => undefined);

function loader() {
  const held: Record<string, (loaded: boolean) => void> = {};
  const prefetch = vi.fn(
    (url: string) =>
      new Promise<boolean>((resolve) => {
        held[url] = resolve;
      }),
  );
  const load = (url: string, loaded = true) => act(async () => held[url]?.(loaded));
  return { prefetch, load };
}

async function showing(sheet: Sheet, prefetch: (url: string) => Promise<boolean | undefined>) {
  const hook = renderHook<Sheet | null, Sheet | null>((next) => useLoadedSheet(next, prefetch), {
    initialProps: sheet,
  });
  await settle();
  return hook;
}

describe('the sheet a scrub bar draws from', () => {
  it('is nothing until the first picture has loaded', async () => {
    const { prefetch } = loader();

    const { result } = await showing(V1, prefetch);

    expect(result.current).toBeNull();
  });

  it('is the sheet once its picture has loaded', async () => {
    const { prefetch, load } = loader();
    const { result } = await showing(V1, prefetch);

    await load(V1.url);

    expect(result.current).toBe(V1);
  });

  it('is the sheet once a loader that answers nothing has loaded it, as the web one does', async () => {
    const prefetch = vi.fn(async () => undefined);

    const { result } = await showing(V1, prefetch);

    expect(result.current).toBe(V1);
  });

  it('stays on the last loaded sheet while a newer one loads', async () => {
    const { prefetch, load } = loader();
    const { result, rerender } = await showing(V1, prefetch);
    await load(V1.url);

    rerender(V2);
    await settle();

    expect(result.current).toBe(V1);
  });

  it('moves to the newer sheet once its picture has loaded', async () => {
    const { prefetch, load } = loader();
    const { result, rerender } = await showing(V1, prefetch);
    await load(V1.url);
    rerender(V2);

    await load(V2.url);

    expect(result.current).toBe(V2);
  });

  it('stays on the last loaded sheet when a newer picture fails to load', async () => {
    const { prefetch, load } = loader();
    const { result, rerender } = await showing(V1, prefetch);
    await load(V1.url);
    rerender(V2);

    await load(V2.url, false);

    expect(result.current).toBe(V1);
  });

  it('does not load the address it already shows a second time', async () => {
    const { prefetch, load } = loader();
    const { rerender } = await showing(V1, prefetch);
    await load(V1.url);

    rerender({ ...V1 });
    await settle();

    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('is nothing once there is no sheet to draw from', async () => {
    const { prefetch, load } = loader();
    const { result, rerender } = await showing(V1, prefetch);
    await load(V1.url);

    rerender(null);

    await waitFor(() => expect(result.current).toBeNull());
  });
});
