type Schedule = (run: () => void) => void;

interface Watched {
  target: Element;
  width: number;
  height: number;
}

interface Box {
  width: number;
  height: number;
}

const TRIGGERS = ['transitionend', 'animationend', 'load'] as const;

function borderBox(target: Element): Box {
  if (target instanceof HTMLElement) {
    return { width: target.offsetWidth, height: target.offsetHeight };
  }
  const rect = target.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function contentBox(target: Element, border: Box): Box {
  const style = getComputedStyle(target);
  const across =
    px(style.paddingLeft) +
    px(style.paddingRight) +
    px(style.borderLeftWidth) +
    px(style.borderRightWidth);
  const down =
    px(style.paddingTop) +
    px(style.paddingBottom) +
    px(style.borderTopWidth) +
    px(style.borderBottomWidth);
  return { width: Math.max(0, border.width - across), height: Math.max(0, border.height - down) };
}

function domRect({ width, height }: Box): DOMRectReadOnly {
  const box = { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height };
  return { ...box, toJSON: () => box };
}

function entryOf(target: Element, border: Box): ResizeObserverEntry {
  const content = contentBox(target, border);
  const size = (box: Box) => [{ inlineSize: box.width, blockSize: box.height }];
  return {
    target,
    contentRect: domRect(content),
    contentBoxSize: size(content),
    borderBoxSize: size(border),
    devicePixelContentBoxSize: size(content),
  };
}

function changed(watched: Watched): ResizeObserverEntry | null {
  const border = borderBox(watched.target);
  if (border.width === watched.width && border.height === watched.height) {
    return null;
  }
  watched.width = border.width;
  watched.height = border.height;
  return entryOf(watched.target, border);
}

function report(error: unknown): void {
  setTimeout(() => {
    throw error;
  });
}

function watchLayout(doc: Document, onChange: () => void): void {
  new MutationObserver(onChange).observe(doc, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  doc.defaultView?.addEventListener('resize', onChange);
  for (const type of TRIGGERS) {
    doc.addEventListener(type, onChange, true);
  }
}

interface Registry {
  observers: Set<LegacyObserver>;
  queue: () => void;
}

function registry(schedule: Schedule): Registry {
  const observers = new Set<LegacyObserver>();
  let queued = false;
  const check = () => {
    queued = false;
    for (const observer of observers) {
      observer.deliver();
    }
  };
  const queue = () => {
    if (!queued && observers.size > 0) {
      queued = true;
      schedule(check);
    }
  };
  return { observers, queue };
}

class LegacyObserver implements ResizeObserver {
  private readonly watched: Watched[] = [];

  constructor(
    private readonly callback: ResizeObserverCallback,
    private readonly shared: Registry,
  ) {}

  observe(target: Element): void {
    if (this.watched.some((w) => w.target === target)) {
      return;
    }
    this.watched.push({ target, width: -1, height: -1 });
    this.shared.observers.add(this);
    this.shared.queue();
  }

  unobserve(target: Element): void {
    const at = this.watched.findIndex((w) => w.target === target);
    if (at >= 0) {
      this.watched.splice(at, 1);
    }
  }

  disconnect(): void {
    this.watched.length = 0;
    this.shared.observers.delete(this);
  }

  deliver(): void {
    const entries = this.watched.map(changed).filter((e) => e !== null);
    if (entries.length === 0) {
      return;
    }
    try {
      this.callback(entries, this);
    } catch (error) {
      report(error);
    }
  }
}

/**
 * A `ResizeObserver` for an engine below Chrome 64. It has none of its own, and
 * react-native-web's `onLayout` is a ResizeObserver, so without one no view
 * ever learns its size. Sizes are read at most once a frame, after a DOM
 * mutation, a window resize, or the end of a transition, an animation or a
 * load, and every element is reported once when it is first observed.
 */
export function legacyResizeObserver(
  doc: Document,
  schedule: Schedule = (run) => requestAnimationFrame(run),
): typeof ResizeObserver {
  const shared = registry(schedule);
  watchLayout(doc, shared.queue);
  return class extends LegacyObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback, shared);
    }
  };
}

/** Installs {@link legacyResizeObserver} on `view` when the engine has no
 * `ResizeObserver` of its own. */
export function provideResizeObserver(view: Window): void {
  if (typeof Reflect.get(view, 'ResizeObserver') === 'function') {
    return;
  }
  Object.defineProperty(view, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: legacyResizeObserver(view.document),
  });
}
