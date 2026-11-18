const ATTRIBUTE = 'data-kroma-gap';
const SKIP = 'data-kroma-gap-skip';
const PATIENCE = 30;
const PIXELS = /^(-?\d+(?:\.\d+)?)px$/;

/** A container's gaps, as CSS lengths; an empty string is no gap on that axis. */
export interface Gaps {
  row: string;
  column: string;
}

/** Where a container's gaps came from: its inline style wins over its classes. */
export type GapSource = 'inline' | 'class';

/** How a gap container lays its children out, as the engine computed it. */
export interface Flow {
  direction: string;
  wrap: boolean;
}

/** What the layout reads from the engine. */
export interface GapReaders {
  flow(element: HTMLElement): Flow;
  inFlow(element: Element): boolean;
}

/** Spaces the children of the containers it is handed. */
export interface GapLayout {
  gapsOf(container: HTMLElement, source: GapSource): Gaps;
  write(container: HTMLElement, source: GapSource, gaps: Gaps): void;
  dispose(): void;
}

/** No gap on either axis. */
export const NO_GAPS: Gaps = { row: '', column: '' };

const EDGE: Record<string, string> = {
  row: 'left',
  'row-reverse': 'right',
  column: 'top',
  'column-reverse': 'bottom',
};

const KEEP = `:not([${SKIP}])`;

function half(value: string, sign: '' | '-'): string {
  const pixels = PIXELS.exec(value);
  if (pixels) {
    return `${(sign === '-' ? -1 : 1) * (Number(pixels[1]) / 2)}px`;
  }
  return `calc(${value} * ${sign}.5)`;
}

const empty = (gaps: Gaps | undefined) => !gaps || (!gaps.row && !gaps.column);

const orZero = (value: string) => value || '0px';

function wrapDeclarations({ row, column }: Gaps): [string, string] {
  return [
    `margin:${half(orZero(row), '-')} ${half(orZero(column), '-')}`,
    `>${KEEP}{margin:${half(orZero(row), '')} ${half(orZero(column), '')}}`,
  ];
}

function declarations(flow: Flow, gaps: Gaps): [string, string] {
  if (flow.wrap) {
    return wrapDeclarations(gaps);
  }
  const edge = EDGE[flow.direction] ?? 'top';
  const size = edge === 'left' || edge === 'right' ? gaps.column : gaps.row;
  return ['', `>${KEEP}~${KEEP}{margin-${edge}:${orZero(size)}}`];
}

function gapSheet(doc: Document) {
  const style = doc.createElement('style');
  doc.head.appendChild(style);
  const keys = new Map<string, string>();
  return {
    keyFor(flow: Flow, gaps: Gaps): string {
      const [own, children] = declarations(flow, gaps);
      const text = `${own}|${children}`;
      const known = keys.get(text);
      if (known) {
        return known;
      }
      const key = String(keys.size + 1);
      const at = `[${ATTRIBUTE}="${key}"]`;
      style.sheet?.insertRule(`${at}${children}`, 0);
      if (own) {
        style.sheet?.insertRule(`${at}{${own}}`, 0);
      }
      keys.set(text, key);
      return key;
    },
    remove: () => style.remove(),
  };
}

function computedReaders(view: Window): GapReaders {
  return {
    flow(element) {
      const style = view.getComputedStyle(element);
      return { direction: style.flexDirection, wrap: style.flexWrap === 'wrap' };
    },
    inFlow(element) {
      const style = view.getComputedStyle(element);
      return (
        style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed'
      );
    },
  };
}

/** Whether this engine spaces flex items by `gap` (Chromium 84 on). */
export function flexGapWorks(doc: Document): boolean {
  const box = doc.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute';
  box.appendChild(doc.createElement('div'));
  box.appendChild(doc.createElement('div'));
  doc.documentElement.appendChild(box);
  const works = box.scrollHeight === 1;
  box.remove();
  return works;
}

function markChildren(container: HTMLElement, readers: GapReaders): void {
  for (const child of Array.from(container.children)) {
    if (readers.inFlow(child)) {
      child.removeAttribute(SKIP);
    } else {
      child.setAttribute(SKIP, '');
    }
  }
}

function nextFrame(doc: Document, run: () => void): void {
  const view = doc.defaultView;
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

function sources() {
  const inline = new WeakMap<HTMLElement, Gaps>();
  const byClass = new WeakMap<HTMLElement, Gaps>();
  const store = (source: GapSource) => (source === 'inline' ? inline : byClass);
  return {
    of: (container: HTMLElement, source: GapSource): Gaps =>
      store(source).get(container) ?? NO_GAPS,
    set: (container: HTMLElement, source: GapSource, gaps: Gaps) =>
      store(source).set(container, gaps),
    effective(container: HTMLElement): Gaps | undefined {
      const own = inline.get(container);
      return empty(own) ? byClass.get(container) : own;
    },
  };
}

function containers(doc: Document, readers: GapReaders) {
  const sheet = gapSheet(doc);
  const watched = new Map<HTMLElement, MutationObserver>();
  return {
    release(container: HTMLElement) {
      container.removeAttribute(ATTRIBUTE);
      watched.get(container)?.disconnect();
      watched.delete(container);
    },
    apply(container: HTMLElement, gaps: Gaps) {
      container.setAttribute(ATTRIBUTE, sheet.keyFor(readers.flow(container), gaps));
      markChildren(container, readers);
      if (!watched.has(container)) {
        const observer = new MutationObserver(() => markChildren(container, readers));
        observer.observe(container, { childList: true });
        watched.set(container, observer);
      }
    },
    dispose() {
      watched.forEach((observer) => observer.disconnect());
      sheet.remove();
    },
  };
}

function frameQueue(doc: Document, settle: (container: HTMLElement) => boolean) {
  const pending = new Map<HTMLElement, number>();
  let queued = false;
  const flush = () => {
    queued = false;
    pending.forEach((tries, container) => {
      if (settle(container) || tries >= PATIENCE) {
        pending.delete(container);
      } else {
        pending.set(container, tries + 1);
      }
    });
    schedule();
  };
  function schedule() {
    if (!queued && pending.size > 0) {
      queued = true;
      nextFrame(doc, flush);
    }
  }
  return {
    add(container: HTMLElement) {
      pending.set(container, 0);
      schedule();
    },
    clear: () => pending.clear(),
  };
}

/**
 * Spaces the children of every container it is handed, the way `gap` would,
 * on an engine whose flexbox has no `gap`. A single line gets a margin on the
 * leading edge of every child after the first, so a container that is itself
 * spaced by its parent keeps the margin its parent gave it. A wrapping one
 * gets the negative-margin technique. A container is read once it is on the
 * page, since a flex direction is only computed there.
 */
export function createGapLayout(doc: Document, readers?: GapReaders): GapLayout {
  const view = doc.defaultView;
  const read = readers ?? (view ? computedReaders(view) : null);
  const known = sources();
  const placed = read ? containers(doc, read) : null;
  const queue = frameQueue(doc, (container) => {
    const gaps = known.effective(container);
    if (!placed || !gaps || empty(gaps)) {
      placed?.release(container);
      return true;
    }
    if (!doc.documentElement.contains(container)) {
      return false;
    }
    placed.apply(container, gaps);
    return true;
  });
  return {
    gapsOf: known.of,
    write(container, source, gaps) {
      known.set(container, source, gaps);
      queue.add(container);
    },
    dispose() {
      queue.clear();
      placed?.dispose();
    },
  };
}
