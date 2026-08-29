// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Reading, readDocument, ringedTab } from './reading';

interface Sighting {
  target: Element;
  isIntersecting: boolean;
  intersectionRect: { left: number; top: number; width: number; height: number };
}

const CONTROLS = '[role="button"]';
const ROW_HEIGHT = 50;

function root(): HTMLElement {
  const mounted = document.getElementById('root');
  if (mounted) return mounted;
  const made = document.createElement('div');
  made.id = 'root';
  document.body.append(made);
  return made;
}

function button(label: string, ringed = false): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', label);
  if (ringed) el.style.outlineWidth = '2px';
  root().append(el);
  return el;
}

function sighting(target: Element, at: number, isIntersecting = true): Sighting {
  return {
    target,
    isIntersecting,
    intersectionRect: { left: 0, top: at * ROW_HEIGHT, width: 100, height: 40 },
  };
}

function observing(report: (targets: Element[]) => Sighting[]): void {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly targets: Element[] = [];
      private scheduled = false;
      constructor(private readonly notify: (entries: Sighting[]) => void) {}
      observe(target: Element): void {
        this.targets.push(target);
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => this.notify(report(this.targets)));
      }
      disconnect(): void {
        this.targets.length = 0;
      }
    },
  );
}

function painting(over: (x: number, y: number) => Element | null): void {
  document.elementFromPoint = over;
}

function laidOut(tiles: readonly Element[], reported = tiles.length): void {
  observing((targets) => targets.slice(0, reported).map((target, at) => sighting(target, at)));
  painting((_, y) => tiles[Math.floor(y / ROW_HEIGHT)] ?? null);
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementFromPoint');
  document.body.innerHTML = '';
});

describe('a reading of the screen', () => {
  it('counts the one control wearing a ring and names it', async () => {
    const lit = button('A', true);
    const dim = button('B');

    laidOut([lit, dim]);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      rings: 1,
      ringed: ['button:A'],
      controls: 2,
      overlaps: 0,
      overlapping: [],
    });
  });

  it('leaves a ring drawn outside the app root out of the count', async () => {
    const tile = button('A', true);
    const overlay = document.createElement('div');
    overlay.style.outlineWidth = '3px';
    document.body.append(overlay);

    laidOut([tile]);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      rings: 1,
      nodes: 1,
    });
  });

  it('reports a control buried under what is painted over it, and names both', async () => {
    button('A');
    const over = button('B');

    observing((targets) => targets.map((target, at) => sighting(target, at)));
    painting(() => over);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      overlaps: 1,
      overlapping: ['button:A under button:B'],
    });
  });

  it('leaves a control its own child answers for alone', async () => {
    const tile = button('A');
    const glyph = document.createElement('span');
    tile.append(glyph);

    observing((targets) => targets.map((target, at) => sighting(target, at)));
    painting(() => glyph);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      overlaps: 0,
      overlapping: [],
    });
  });

  it('counts every buried control but names only the first six', async () => {
    const cover = document.createElement('div');
    root().append(cover);
    const tiles = Array.from({ length: 7 }, (_, at) => button(`T${at}`));

    observing(() => tiles.map((target, at) => sighting(target, at)));
    painting(() => cover);

    const seen = await readDocument({ controls: CONTROLS, wait: 0 });

    expect(seen.overlaps).toBe(7);
    expect(seen.overlapping).toHaveLength(6);
  });

  it('measures nothing on a screen that mounted no control at all', async () => {
    root().append(document.createElement('p'));

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      controls: 0,
      nodes: 1,
      overlaps: 0,
    });
  });

  it('reads the whole page when the app never mounted its root', async () => {
    const tile = document.createElement('div');
    tile.setAttribute('role', 'button');
    document.body.append(tile);

    laidOut([tile]);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      controls: 1,
    });
  });

  it('gives up on the controls the observer never reported', async () => {
    const early = button('A');
    const late = button('B');
    const cover = document.createElement('div');
    root().append(cover);

    laidOut([early, late], 1);
    painting(() => cover);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      controls: 2,
      overlaps: 1,
    });
  });

  it('drops a control the observer says has left the screen', async () => {
    const onScreen = button('A');
    const scrolledOff = button('B');
    const cover = document.createElement('div');
    root().append(cover);

    observing(() => [sighting(onScreen, 0), sighting(scrolledOff, 1, false)]);
    painting(() => cover);

    await expect(readDocument({ controls: CONTROLS, wait: 0 })).resolves.toMatchObject({
      controls: 2,
      overlaps: 1,
    });
  });
});

const ON_THE_BAR: Reading = {
  rings: 1,
  ringed: ['tab:Films'],
  controls: 12,
  nodes: 300,
  overlaps: 0,
  overlapping: [],
};

describe('the tab wearing the ring', () => {
  it('reads the label off the ringed tab', () => {
    expect(ringedTab(ON_THE_BAR)).toBe('Films');
  });

  it('is nobody when the ring has moved below the bar', () => {
    expect(ringedTab({ ...ON_THE_BAR, ringed: ['button:Play'] })).toBeNull();
  });
});
