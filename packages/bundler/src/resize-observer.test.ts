// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacyResizeObserver, provideResizeObserver } from './resize-observer';

const pending: Array<() => void> = [];
const made: ResizeObserver[] = [];

function frame(): void {
  for (const run of pending.splice(0)) {
    run();
  }
}

async function mutated(): Promise<void> {
  await Promise.resolve();
  frame();
}

function sized(width: number, height: number): HTMLElement {
  const element = document.createElement('div');
  resize(element, width, height);
  document.body.append(element);
  return element;
}

function resize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: height });
}

function observer() {
  const Observer = legacyResizeObserver(document, (run) => pending.push(run));
  const seen: Array<[Element, number, number]> = [];
  const instance = new Observer((entries) => {
    for (const entry of entries) {
      seen.push([entry.target, entry.contentRect.width, entry.contentRect.height]);
    }
  });
  made.push(instance);
  return { instance, seen };
}

afterEach(() => {
  for (const instance of made.splice(0)) {
    instance.disconnect();
  }
  pending.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('legacyResizeObserver', () => {
  it('reports an element once when it is first observed', () => {
    const element = sized(320, 180);
    const { instance, seen } = observer();

    instance.observe(element);
    frame();

    expect(seen).toEqual([[element, 320, 180]]);
  });

  it('reports an element again once a mutation has changed its size', async () => {
    const element = sized(320, 180);
    const { instance, seen } = observer();
    instance.observe(element);
    frame();

    resize(element, 640, 180);
    element.setAttribute('class', 'wide');
    await mutated();

    expect(seen.at(-1)).toEqual([element, 640, 180]);
  });

  it('stays quiet when a mutation leaves the size as it was', async () => {
    const element = sized(320, 180);
    const { instance, seen } = observer();
    instance.observe(element);
    frame();

    element.setAttribute('class', 'same');
    await mutated();

    expect(seen).toHaveLength(1);
  });

  it('reports the content box inside padding and border', () => {
    const element = sized(320, 180);
    element.style.padding = '10px';
    element.style.border = '2px solid';
    const { instance, seen } = observer();

    instance.observe(element);
    frame();

    expect(seen).toEqual([[element, 296, 156]]);
  });

  it('hears nothing more about an element it stopped observing', async () => {
    const element = sized(320, 180);
    const { instance, seen } = observer();
    instance.observe(element);
    frame();

    instance.unobserve(element);
    resize(element, 640, 360);
    element.setAttribute('class', 'wide');
    await mutated();

    expect(seen).toHaveLength(1);
  });

  it('hears nothing more once disconnected', () => {
    const element = sized(320, 180);
    const { instance, seen } = observer();
    instance.observe(element);
    frame();

    instance.disconnect();
    resize(element, 640, 360);
    window.dispatchEvent(new Event('resize'));
    frame();

    expect(seen).toHaveLength(1);
  });

  it('reads sizes once a frame however many mutations came before it', async () => {
    const element = sized(320, 180);
    const { instance } = observer();
    instance.observe(element);
    frame();

    element.setAttribute('class', 'a');
    element.setAttribute('class', 'b');
    element.textContent = 'c';
    await Promise.resolve();

    expect(pending).toHaveLength(1);
  });

  it('does no work while nothing is observed', async () => {
    legacyResizeObserver(document, (run) => pending.push(run));

    document.body.setAttribute('class', 'idle');
    await Promise.resolve();

    expect(pending).toHaveLength(0);
  });

  it('keeps reporting to other observers when one callback throws', () => {
    const element = sized(320, 180);
    const Observer = legacyResizeObserver(document, (run) => pending.push(run));
    const heard = vi.fn();
    const broken = new Observer(() => {
      throw new Error('broken handler');
    });
    const working = new Observer(heard);
    made.push(broken, working);
    broken.observe(element);
    working.observe(element);
    vi.useFakeTimers();

    frame();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(() => vi.runAllTimers()).toThrow('broken handler');
  });
});

describe('provideResizeObserver', () => {
  it('installs an observer on an engine that has none', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    provideResizeObserver(window);

    expect(typeof window.ResizeObserver).toBe('function');
  });

  it('leaves an engine its own observer', () => {
    const native = vi.fn();
    vi.stubGlobal('ResizeObserver', native);

    provideResizeObserver(window);

    expect(window.ResizeObserver).toBe(native);
  });
});
