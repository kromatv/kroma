// Which view of a story is on the canvas, and how one is spelled in an address.
//
// Apart from the routing adapters that read and write it, because the story SDK
// reads a view too: nothing here imports anything, so a `*.stories.tsx` that
// pulls in `@kroma/workbench/story` does not pull in the design system with it.

type View = 'preview' | 'docs' | 'matrix' | `scene:${number}` | `demo:${number}`;

function parseView(raw: string | null | undefined): View | undefined {
  if (!raw) return undefined;
  if (raw === 'matrix' || raw === 'preview' || raw === 'docs') return raw;
  // A bare number is the legacy spelling of a scene index; old links keep working.
  if (/^\d+$/.test(raw)) return `scene:${Number(raw)}`;
  // Both separators parse: `scene:1` in a search param, `scene-1` in a path segment.
  const at = /^(scene|demo)[:-](\d+)$/.exec(raw);
  return at ? (`${at[1]}:${Number(at[2])}` as View) : undefined;
}

// A view as a path segment (`scene-1`), or null when it is the default and should be absent
// from the URL.
function viewPath(view: View | undefined): string | null {
  if (!view || view === 'preview') return null;
  return view.replace(':', '-');
}

/** Which scene or demo a `scene:N` / `demo:N` view names. Meaningless, and
 * never asked, for `preview` and `matrix`. */
function viewIndex(view: View): number {
  return Number(view.slice(view.indexOf(':') + 1));
}

export type { View };
export { parseView, viewIndex, viewPath };
