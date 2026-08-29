import { afterEach, describe, expect, it, vi } from 'vitest';
import { openChannel } from '../server/host';
import {
  fileOfOrigin,
  labelOf,
  onOriginTraced,
  originAt,
  originOf,
  screenFrame,
  sourceOrigin,
} from './origin';

const AT = 'http://localhost:3000/@fs/kroma';

function stackOf(...frames: string[]): string {
  return ['Error', ...frames.map((frame) => `    at ${frame}`)].join('\n');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a stack', () => {
  it('names the first frame that is the screen rather than the machinery', () => {
    const stack = stackOf(
      `originOf (${AT}/packages/i18n-devtools/src/origin.ts:20:9)`,
      `fn (${AT}/packages/i18n/src/i18n.ts:88:20)`,
      `Screen (${AT}/clients/web/src/features/auth/who.tsx:42:19)`,
    );

    expect(labelOf(screenFrame(stack) as never)).toBe('who.tsx:42');
  });

  it('walks past the kit and anything installed', () => {
    const stack = stackOf(
      `Text (${AT}/packages/ui/src/components/atoms/text/text.tsx:80:3)`,
      'renderWithHooks (http://localhost:3000/node_modules/.vite/deps/react-dom.js:1:1)',
      `Row (${AT}/packages/tv/src/features/home/row.tsx:12:4)`,
    );

    expect(labelOf(screenFrame(stack) as never)).toBe('row.tsx:12');
  });

  it('drops the query a dev server appends to a module', () => {
    const at = screenFrame(stackOf(`Screen (${AT}/clients/web/src/app.tsx?t=17:9:1)`));

    expect(at).toMatchObject({ file: '/kroma/clients/web/src/app.tsx', line: 9, column: 1 });
    expect(labelOf(at as never)).toBe('app.tsx:9');
  });

  it('says nothing where the stack is all machinery', () => {
    expect(screenFrame(stackOf(`fn (${AT}/packages/i18n/src/i18n.ts:88:20)`))).toBeNull();
  });
});

describe('where a message is drawn from', () => {
  it('reads the stack once per key, which is what makes it affordable', () => {
    const stacks = [
      stackOf(`Screen (${AT}/clients/web/src/first.tsx:1:1)`),
      stackOf(`Screen (${AT}/clients/web/src/second.tsx:2:2)`),
    ];
    vi.stubGlobal(
      'Error',
      class {
        stack = stacks.shift();
      },
    );

    const first = originOf('auth.once');

    expect(labelOf(first as never)).toBe('first.tsx:1');
    expect(labelOf(originOf('auth.once') as never)).toBe('first.tsx:1');
    expect(stacks).toHaveLength(1);
  });
});

describe('handing a position to an editor', () => {
  it('writes the file with the line and column it names', () => {
    const at = screenFrame(stackOf(`Screen (${AT}/clients/web/src/who.tsx:9:4)`));

    expect(fileOfOrigin(at as never)).toBe('/kroma/clients/web/src/who.tsx:9:4');
  });
});

describe('tracing a position back to the source', () => {
  it('hands back the served one until the dev server answers', () => {
    const at = screenFrame(stackOf(`Screen (${AT}/clients/web/src/a.tsx:59:8)`)) as never;
    openChannel({ send: () => {}, on: () => {} });

    expect(sourceOrigin(at)).toBe(at);
  });

  it('keeps a position already traced as it stands', () => {
    const traced = { url: '/a', line: 1, column: 1, file: '/a', source: true } as const;

    expect(sourceOrigin(traced)).toBe(traced);
  });

  it('takes the line the dev server maps it to, and says so', async () => {
    const sent: Array<{ at: number }> = [];
    const heard = new Map<string, (answer: unknown) => void>();
    openChannel({
      send: (_event, data) => sent.push(data as { at: number }),
      on: (event, run) => heard.set(event, run),
    });
    const at = screenFrame(stackOf(`Screen (${AT}/clients/web/src/b.tsx:59:8)`)) as never;
    const told = vi.fn();
    const stop = onOriginTraced(told);

    sourceOrigin(at);
    heard.get('kroma:i18n:where')?.({ at: sent[0]?.at, line: 45 });
    await Promise.resolve();
    await Promise.resolve();

    expect(sourceOrigin(at)).toMatchObject({ line: 45, source: true });
    expect(told).toHaveBeenCalled();

    stop();
    openChannel(null);
  });
});

describe('where a hard-coded string was drawn from', () => {
  it('reads it off the tree that drew it', () => {
    const element = { parentElement: null } as unknown as Element;
    const node = { parentElement: element } as unknown as Node;
    Reflect.set(element, '__reactFiber$abc', {
      _debugStack: { stack: stackOf(`Row (${AT}/packages/tv/src/features/home/row.tsx:12:4)`) },
    });

    expect(originAt(node)).toMatchObject({ line: 12 });
  });

  it('walks up to the owner that has a stack worth reading', () => {
    const element = { parentElement: null } as unknown as Element;
    const node = { parentElement: element } as unknown as Node;
    Reflect.set(element, '__reactFiber$abc', {
      _debugStack: { stack: stackOf(`Text (${AT}/packages/ui/src/components/atoms/text.tsx:3:1)`) },
      return: {
        _debugStack: undefined,
        return: {
          _debugStack: {
            stack: stackOf(`Row (${AT}/packages/tv/src/features/home/row.tsx:12:4)`),
          },
        },
      },
    });

    expect(originAt(node)).toMatchObject({ line: 12 });
  });

  it('gives up rather than walking a tree forever', () => {
    const element = { parentElement: null } as unknown as Element;
    const node = { parentElement: element } as unknown as Node;
    const loop: { _debugStack: undefined; return: unknown } = {
      _debugStack: undefined,
      return: null,
    };
    loop.return = loop;
    Reflect.set(element, '__reactFiber$abc', loop);

    expect(originAt(node)).toBeNull();
  });

  it('walks off the top of the tree rather than past it', () => {
    const element = { parentElement: null } as unknown as Element;
    const node = { parentElement: element } as unknown as Node;
    Reflect.set(element, '__reactFiber$abc', { _debugStack: { stack: 'Error' } });

    expect(originAt(node)).toBeNull();
  });

  it('says nothing for an element React left a key on and nothing behind it', () => {
    const element = { parentElement: null } as unknown as Element;
    const node = { parentElement: element } as unknown as Node;
    Reflect.set(element, '__reactFiber$abc', null);

    expect(originAt(node)).toBeNull();
  });

  it('says nothing where React drew nothing', () => {
    expect(originAt({ parentElement: null } as unknown as Node)).toBeNull();
    expect(originAt({ parentElement: {} } as unknown as Node)).toBeNull();
  });

  it('reads a frame the browser wrote without an @fs prefix', () => {
    const stack = stackOf('Row (http://localhost:3000/src/app.tsx:9:2)');

    expect(screenFrame(stack)).toMatchObject({ file: '/src/app.tsx', line: 9 });
  });

  it('reads nothing off an engine that wrote no stack at all', () => {
    expect(screenFrame(undefined)).toBeNull();
  });

  it('passes over a line with nowhere near enough colons to be a frame', () => {
    expect(screenFrame(stackOf('http://localhost'))).toBeNull();
  });

  it('passes over a frame whose line is not a number', () => {
    expect(screenFrame(stackOf(`Row (${AT}/a.tsx:nine:2)`))).toBeNull();
  });

  it('passes over a frame whose column is not a number', () => {
    expect(screenFrame(stackOf(`Row (${AT}/a.tsx:9:two)`))).toBeNull();
  });
});
