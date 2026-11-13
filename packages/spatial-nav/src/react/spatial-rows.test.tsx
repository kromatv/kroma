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

/** Puts the tile `id` at `x` of the window, answered at once as Fabric does. */
function showAt(id: string, x: number, y: number) {
  const tile = screen.getByTestId(id) as unknown as { measureInWindow: (done: Measured) => void };
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

  it('keep the order of the tree when the node is not spatial', () => {
    render(<Page spatial={false} />);
    ['a0', 'a1', 'a2'].forEach((id, index) => showAt(id, index * 100, 0));
    ['b0', 'b1', 'b2'].forEach((id, index) => showAt(id, index * 100, 200));

    expect(down()).toBe('b0');
  });
});
