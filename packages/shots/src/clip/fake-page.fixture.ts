/// <reference lib="dom" />

/** A page that runs what the sweep evaluates in this test's own document, and
 *  calls `land` with itself each time it goes to a page or reloads one. */
export class FakePage {
  at = 'about:blank';

  constructor(private readonly land: (page: FakePage) => void = () => undefined) {}

  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
    return Promise.resolve(fn(arg));
  }

  waitForFunction<A>(fn: (arg: A) => boolean, arg: A): Promise<unknown> {
    return fn(arg) ? Promise.resolve(true) : Promise.reject(new Error('timed out'));
  }

  waitForTimeout(): Promise<void> {
    return Promise.resolve();
  }

  url(): string {
    return this.at;
  }

  goto(url: string): Promise<unknown> {
    this.at = url;
    this.land(this);
    return Promise.resolve(null);
  }

  reload(): Promise<unknown> {
    this.land(this);
    return Promise.resolve(null);
  }

  $$eval<R>(selector: string, fn: (elements: Element[]) => R): Promise<R> {
    return Promise.resolve(fn([...document.querySelectorAll(selector)]));
  }
}

/** The kit's reader as a page holds it: `screenText()` answers each of `texts`
 *  in turn, then the last again, and `describeScreen()` answers `tree`. */
export function fakeReader(tree: unknown, texts: readonly string[] = ['screen']) {
  const pending = [...texts];
  return {
    describeScreen: () => tree,
    screenText: () => (pending.length > 1 ? pending.shift() : pending[0]),
  };
}

/** A tree of `describeScreen()` holding one clipped Text per entry of `texts`;
 *  a null text is one its props do not carry. */
export function clippedTree(...texts: (string | null)[]) {
  const nodes = texts.map((text) => ({
    name: 'Text',
    props: { children: text ?? '[element]' },
    box: { x: 10, y: 20, width: 60, height: 20 },
    clipped: { width: 8, height: 0 },
    children: [],
  }));
  return { nodes: [{ name: 'Screen', props: {}, box: null, children: nodes }] };
}
