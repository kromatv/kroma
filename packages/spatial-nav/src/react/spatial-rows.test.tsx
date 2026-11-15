// @vitest-environment jsdom

import type { SpatialNavigator } from '@kromatv/spatial-nav';
import {
  DefaultFocus,
  NavigatorItem,
  NavigatorNode,
  NavigatorRoot,
  NavigatorView,
  useNavigator,
} from '@kromatv/spatial-nav/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

const held: { nav: SpatialNavigator | null } = { nav: null };

function Capture() {
  const nav = useNavigator();
  useEffect(() => {
    held.nav = nav;
  }, [nav]);
  return null;
}

type Measured = (x: number, y: number, width: number, height: number) => void;

interface FabricView {
  getBoundingClientRect: undefined;
  measureInWindow: (done: Measured) => void;
}

/** Puts the tile `id` at `x` of the window, as a browser reports an element. */
function showAt(id: string, x: number, y: number) {
  screen.getByTestId(id).getBoundingClientRect = () => new DOMRect(x, y, 90, 150);
}

/** Puts the tile `id` at `x` of the window as Fabric reports a view: no element to ask, and `measureInWindow` answered at once. */
function showOnFabric(id: string, x: number, y: number) {
  const tile = screen.getByTestId(id) as unknown as FabricView;
  tile.getBoundingClientRect = undefined;
  tile.measureInWindow = (done) => done(x, y, 90, 150);
}

function Tile({ id, first = false }: Readonly<{ id: string; first?: boolean }>) {
  const item = (
    <NavigatorItem viewProps={{ testID: id }}>
      {({ focused }) => <View testID={focused ? 'lit' : undefined} />}
    </NavigatorItem>
  );
  return first ? <DefaultFocus>{item}</DefaultFocus> : item;
}

function Page({ spatial }: Readonly<{ spatial: boolean }>) {
  return (
    <NavigatorRoot>
      <Capture />
      <NavigatorNode spatial={spatial}>
        <NavigatorView direction="horizontal">
          <Tile id="a0" />
          <Tile id="a1" />
          <Tile id="a2" first />
        </NavigatorView>
        <NavigatorView direction="horizontal">
          <Tile id="b0" />
          <Tile id="b1" />
          <Tile id="b2" />
        </NavigatorView>
      </NavigatorNode>
    </NavigatorRoot>
  );
}

function down(): string | null {
  act(() => {
    held.nav?.handle('down');
  });
  return screen.getByTestId('lit').parentElement?.getAttribute('data-testid') ?? null;
}

describe('the rows of a spatial node', () => {
  it('land a move down on the tile that shows under the focus', () => {
    render(<Page spatial />);
    ['a0', 'a1', 'a2'].forEach((id, index) => showAt(id, index * 100, 0));
    ['b0', 'b1', 'b2'].forEach((id, index) => showAt(id, index * 100, 200));

    expect(down()).toBe('b2');
  });

  it('follow a row scrolled on its own to the tile that shows there now', () => {
    render(<Page spatial />);
    ['a0', 'a1', 'a2'].forEach((id, index) => showAt(id, index * 100, 0));
    ['b0', 'b1', 'b2'].forEach((id, index) => showAt(id, 100 + index * 100, 200));

    expect(down()).toBe('b1');
  });

  it('ask a view that is no element where it shows through measureInWindow', () => {
    render(<Page spatial />);
    ['a0', 'a1', 'a2'].forEach((id, index) => showOnFabric(id, index * 100, 0));
    ['b0', 'b1', 'b2'].forEach((id, index) => showOnFabric(id, 100 + index * 100, 200));

    expect(down()).toBe('b1');
  });

  it('keep the order of the tree when the node is not spatial', () => {
    render(<Page spatial={false} />);
    ['a0', 'a1', 'a2'].forEach((id, index) => showAt(id, index * 100, 0));
    ['b0', 'b1', 'b2'].forEach((id, index) => showAt(id, index * 100, 200));

    expect(down()).toBe('b0');
  });
});
