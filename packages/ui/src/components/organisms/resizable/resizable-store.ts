// Where a dragged layout is kept between visits.
//
// Keyed by the ARRANGEMENT as well as by the group, because a window crossing a
// breakpoint hands the same group a different number of panels, and a layout
// written for three of them says nothing about two.

import { z } from 'zod';

/**
 * The two calls a `<Resizable.Root autoSaveId>` needs from a key/value store.
 * `localStorage` satisfies it, and so does a native app's own device store -
 * React Native has no `localStorage`, so a native host that wants a layout to
 * survive a reload passes one in.
 */
interface ResizableStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type SavedLayouts = Record<string, number[]>;

function browserStorage(): ResizableStorage | null {
  try {
    // biome-ignore lint/style/noRestrictedGlobals: audited - this IS the capability probe, and it returns null on every native target, where a host passes its own device store instead.
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading it can throw outright (privacy mode, a sandboxed iframe).
    return null;
  }
}

const savedLayouts = z
  .record(z.string().max(256), z.unknown())
  .refine((value) => Object.keys(value).length <= 256);
const savedSizes = z.array(z.number().nonnegative()).max(128);

function layoutsOf(value: unknown): SavedLayouts {
  const layouts = savedLayouts.safeParse(value);
  if (!layouts.success) return {};
  const out: SavedLayouts = {};
  for (const [key, value] of Object.entries(layouts.data)) {
    const sizes = savedSizes.safeParse(value);
    if (sizes.success) out[key] = sizes.data;
  }
  return out;
}

function readLayouts(store: ResizableStorage | null, id: string): SavedLayouts {
  const raw = store?.getItem(id);
  if (!raw || raw.length > 1_000_000) return {};
  try {
    return layoutsOf(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Whatever was dragged last visit for this arrangement, or nothing. */
function readLayout(
  store: ResizableStorage | null,
  id: string | undefined,
  arrangement: string,
): number[] | null {
  if (!id) return null;
  const saved = readLayouts(store, id)[arrangement];
  return saved && saved.length > 0 ? saved : null;
}

function writeLayout(
  store: ResizableStorage | null,
  id: string | undefined,
  arrangement: string,
  sizes: readonly number[],
): void {
  if (!store || !id) return;
  try {
    store.setItem(id, JSON.stringify({ ...readLayouts(store, id), [arrangement]: [...sizes] }));
  } catch {
    // A full or refusing store costs the reader nothing this session.
  }
}

export type { ResizableStorage };
export { browserStorage, layoutsOf, readLayout, writeLayout };
