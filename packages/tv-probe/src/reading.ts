export interface Reading {
  rings: number;
  ringed: string[];
  controls: number;
  nodes: number;
  overlaps: number;
  overlapping: string[];
}

/** What the screen looks like right now, counted inside `#root` so a dev-only
 * overlay appended to `<body>` is never mistaken for the app. Runs in the page,
 * so it closes over nothing: `page.evaluate` ships its source, not its scope.
 * A ring is an inline `outlineWidth`, which is what `focusable.tsx` draws.
 *
 * Buried rather than merely overlapping: a rect on its own ignores the clip an
 * ancestor puts on it and whatever is painted over it, so a tile scrolled under
 * the top bar would read as a collision. */
export async function readDocument({
  controls,
  wait,
}: {
  controls: string;
  wait: number;
}): Promise<Reading> {
  const root = document.getElementById('root') ?? document.body;
  const all = [...root.querySelectorAll<HTMLElement>('*')];
  const ringed = all.filter(
    (el) => el.style.outlineWidth !== '' && el.style.outlineWidth !== '0px',
  );
  const name = (el: Element) =>
    `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${el.getAttribute('aria-label') ?? el.textContent ?? ''}`.slice(
      0,
      40,
    );

  const controlled = [...root.querySelectorAll<HTMLElement>(controls)];
  const onScreen = await new Promise<Array<{ el: HTMLElement; box: DOMRectReadOnly }>>(
    (resolve) => {
      if (controlled.length === 0) {
        resolve([]);
        return;
      }
      const seen = new Map<Element, DOMRectReadOnly>();
      const done = () => {
        observer.disconnect();
        resolve(
          controlled
            .map((el) => ({ el, box: seen.get(el) }))
            .filter((at): at is { el: HTMLElement; box: DOMRectReadOnly } => at.box != null),
        );
      };
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.set(entry.target, entry.intersectionRect);
          else seen.delete(entry.target);
        }
        if (entries.length >= controlled.length) done();
      });
      for (const el of controlled) observer.observe(el);
      setTimeout(done, wait);
    },
  );

  const overlapping: string[] = [];
  let overlaps = 0;
  for (const { el, box } of onScreen) {
    const over = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!over || el === over || el.contains(over)) continue;
    overlaps += 1;
    if (overlapping.length < 6) overlapping.push(`${name(el)} under ${name(over)}`);
  }

  return {
    rings: ringed.length,
    ringed: ringed.map(name),
    controls: controlled.length,
    nodes: all.length,
    overlaps,
    overlapping,
  };
}

export function ringedTab(seen: Reading): string | null {
  const tab = seen.ringed.find((entry) => entry.startsWith('tab:'));
  return tab ? tab.slice('tab:'.length) : null;
}
