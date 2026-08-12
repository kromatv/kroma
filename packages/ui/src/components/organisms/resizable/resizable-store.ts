// Where a dragged layout is kept between visits.
//
// Keyed by the ARRANGEMENT as well as by the group, because a window crossing a
// breakpoint hands the same group a different number of panels, and a layout
// written for three of them says nothing about two.

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

function layoutsOf(value: unknown): SavedLayouts {
  if (typeof value !== 'object' || value === null) return {};
  const out: SavedLayouts = {};
  for (const [key, sizes] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(sizes)) continue;
    if (sizes.every((size) => typeof size === 'number' && Number.isFinite(size) && size >= 0)) {
      out[key] = sizes as number[];
    }
  }
  return out;
}

function readLayouts(store: ResizableStorage | null, id: string): SavedLayouts {
  const raw = store?.getItem(id);
  if (!raw) return {};
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
