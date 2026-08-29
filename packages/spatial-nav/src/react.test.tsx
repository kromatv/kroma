// @vitest-environment jsdom

import type { Direction, SpatialNavigator } from '@kroma/spatial-nav';
import {
  DefaultFocus,
  NavigatorItem,
  NavigatorNode,
  NavigatorRoot,
  NavigatorView,
  useLockNavigator,
  useNavigator,
} from '@kroma/spatial-nav/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const held: { nav: SpatialNavigator | null } = { nav: null };

function Probe() {
  const nav = useNavigator();
  useEffect(() => {
    held.nav = nav;
  }, [nav]);
  return null;
}

function navigator(): SpatialNavigator {
  if (!held.nav) throw new Error('nothing mounted a navigator');
  return held.nav;
}

function press(direction: Direction) {
  act(() => {
    navigator().handle(direction);
  });
}

/** Each tile is its own testID until it takes the focus, when it becomes `lit`. */
function Tile({ id, autoFocus = false }: Readonly<{ id: string; autoFocus?: boolean }>) {
  const item = (
    <NavigatorItem>{({ focused }) => <View testID={focused ? 'lit' : id} />}</NavigatorItem>
  );
  return autoFocus ? <DefaultFocus>{item}</DefaultFocus> : item;
}

function RowOf({
  ids,
  open,
  active = true,
  onEdge,
}: Readonly<{
  ids: readonly string[];
  open?: string;
  active?: boolean;
  onEdge?: (direction: Direction) => void;
}>) {
  return (
    <NavigatorRoot active={active} onEdge={onEdge}>
      <Probe />
      <NavigatorView direction="horizontal">
        {ids.map((id) => (
          <Tile key={id} id={id} autoFocus={id === open} />
        ))}
      </NavigatorView>
    </NavigatorRoot>
  );
}

function ids(count: number, from = 0): string[] {
  return Array.from({ length: count }, (_, index) => `t${index + from}`);
}

function lit(): number {
  return screen.queryAllByTestId('lit').length;
}

describe('<NavigatorRoot>', () => {
  it('registers items in the order they are written', () => {
    render(<RowOf ids={['a', 'b', 'c']} open="a" />);

    press('right');
    const second = screen.queryByTestId('b');
    press('right');

    expect(second).toBeNull();
    expect(screen.queryByTestId('c')).toBeNull();
  });

  it('walks back the way it came', () => {
    render(<RowOf ids={['a', 'b', 'c']} open="c" />);

    press('left');

    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('opens on the item inside <DefaultFocus>', () => {
    render(<RowOf ids={['a', 'b', 'c']} open="b" />);

    expect(screen.queryByTestId('b')).toBeNull();
    expect(lit()).toBe(1);
  });

  it('paints the focus ring on exactly one item', () => {
    render(<RowOf ids={ids(6)} open="t0" />);

    press('right');

    expect(lit()).toBe(1);
  });

  it('paints the focus ring on exactly one item at every step of a walk', () => {
    render(<RowOf ids={ids(6)} open="t0" />);

    const counts = ids(5, 1).map(() => {
      press('right');
      return lit();
    });

    expect(counts).toEqual([1, 1, 1, 1, 1]);
  });

  it('leaves the focus alone when a later item mounts', () => {
    const { rerender } = render(<RowOf ids={['a']} open="a" />);

    rerender(<RowOf ids={['a', 'b']} open="a" />);

    expect(screen.queryByTestId('a')).toBeNull();
    expect(lit()).toBe(1);
  });

  it('survives a re-render that grows the row', () => {
    const { rerender } = render(<RowOf ids={ids(4)} open="t0" />);

    expect(() => rerender(<RowOf ids={ids(8)} open="t0" />)).not.toThrow();
  });

  it('walks the whole row after it grows', () => {
    const { rerender } = render(<RowOf ids={ids(4)} open="t0" />);
    rerender(<RowOf ids={ids(8)} open="t0" />);

    for (let step = 0; step < 7; step += 1) press('right');

    expect(screen.queryByTestId('t7')).toBeNull();
    expect(lit()).toBe(1);
  });

  it('keeps a focus when the focused item unmounts', () => {
    const { rerender } = render(<RowOf ids={['a', 'b', 'c']} open="b" />);

    rerender(<RowOf ids={['a', 'c']} open="b" />);

    expect(navigator().focusedId).not.toBeNull();
    expect(lit()).toBe(1);
  });

  it('hands the focus to the item before the one that unmounted', () => {
    const { rerender } = render(<RowOf ids={['a', 'b', 'c']} open="b" />);

    rerender(<RowOf ids={['a', 'c']} open="b" />);

    expect(screen.queryByTestId('a')).toBeNull();
  });

  it('calls onEdge for a direction with nowhere to go', () => {
    const onEdge = vi.fn();
    render(<RowOf ids={['a']} open="a" onEdge={onEdge} />);

    press('right');

    expect(onEdge).toHaveBeenCalledWith('right');
  });

  it('answers nothing while it is inactive', () => {
    render(<RowOf ids={['a', 'b']} open="a" active={false} />);

    press('right');

    expect(screen.getByTestId('b')).toBeTruthy();
  });

  it('answers again once it is active', () => {
    const { rerender } = render(<RowOf ids={['a', 'b']} open="a" active={false} />);

    rerender(<RowOf ids={['a', 'b']} open="a" />);
    press('right');

    expect(screen.queryByTestId('b')).toBeNull();
  });
});

function Slots({ onEvent }: Readonly<{ onEvent: (event: string) => void }>) {
  return (
    <NavigatorRoot>
      <Probe />
      <NavigatorView direction="horizontal">
        {['a', 'b'].map((id) => (
          <NavigatorNode
            key={id}
            onActive={() => onEvent(`active:${id}`)}
            onInactive={() => onEvent(`inactive:${id}`)}
          >
            <Tile id={id} autoFocus={id === 'a'} />
          </NavigatorNode>
        ))}
      </NavigatorView>
    </NavigatorRoot>
  );
}

describe('<NavigatorNode>', () => {
  it('activates the slot the focus walks into', () => {
    const onEvent = vi.fn();
    render(<Slots onEvent={onEvent} />);

    press('right');

    expect(onEvent).toHaveBeenCalledWith('active:b');
    expect(onEvent).toHaveBeenCalledWith('inactive:a');
  });

  it('activates the slot the focus walks back into', () => {
    const onEvent = vi.fn();
    render(<Slots onEvent={onEvent} />);
    press('right');
    onEvent.mockClear();

    press('left');

    expect(onEvent).toHaveBeenCalledWith('active:a');
    expect(onEvent).toHaveBeenCalledWith('inactive:b');
  });
});

function Locker({ hold }: Readonly<{ hold: boolean }>) {
  const { lock, unlock } = useLockNavigator();
  useEffect(() => {
    if (!hold) return;
    lock();
    return unlock;
  }, [hold, lock, unlock]);
  return null;
}

function Surfaces({ first, second }: Readonly<{ first: boolean; second: boolean }>) {
  return (
    <NavigatorRoot>
      <Probe />
      <Locker hold={first} />
      <Locker hold={second} />
      <NavigatorView direction="horizontal">
        <Tile id="a" autoFocus />
        <Tile id="b" />
      </NavigatorView>
    </NavigatorRoot>
  );
}

describe('useLockNavigator', () => {
  it('locks the navigator out of the remote', () => {
    render(<Surfaces first second={false} />);

    press('right');

    expect(screen.getByTestId('b')).toBeTruthy();
  });

  it('stays locked while one of two surfaces is still up', () => {
    const { rerender } = render(<Surfaces first second />);

    rerender(<Surfaces first second={false} />);
    press('right');

    expect(screen.getByTestId('b')).toBeTruthy();
  });

  it('unlocks whichever order the surfaces close in', () => {
    const { rerender } = render(<Surfaces first second />);

    rerender(<Surfaces first={false} second />);
    rerender(<Surfaces first={false} second={false} />);
    press('right');

    expect(screen.queryByTestId('b')).toBeNull();
    expect(lit()).toBe(1);
  });
});
