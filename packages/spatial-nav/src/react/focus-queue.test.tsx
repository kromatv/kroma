// @vitest-environment jsdom

import { SpatialNavigator } from '@kroma/spatial-nav';
import {
  NavigatorItem,
  NavigatorRoot,
  NavigatorView,
  type NodeHandle,
} from '@kroma/spatial-nav/react';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { focusQueue } from './focus-queue';

afterEach(cleanup);

function TileAskingOnMount() {
  const entry = useRef<NodeHandle>(null);
  useEffect(() => {
    entry.current?.focus();
  }, []);
  return (
    <NavigatorItem ref={entry}>
      {({ focused }) => <View testID={focused ? 'lit' : 'dark'} />}
    </NavigatorItem>
  );
}

function BranchArrivingWhole() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) return null;
  return (
    <NavigatorView direction="horizontal">
      <TileAskingOnMount />
    </NavigatorView>
  );
}

describe('focus asked for before the tree that holds it is whole', () => {
  it('lands when the whole screen mounts at once', () => {
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <TileAskingOnMount />
        </NavigatorView>
      </NavigatorRoot>,
    );
    expect(screen.getByTestId('lit')).toBeTruthy();
  });

  it('lands when the branch holding it mounts whole, under a root that does not re-render', () => {
    render(
      <NavigatorRoot>
        <BranchArrivingWhole />
      </NavigatorRoot>,
    );
    expect(screen.getByTestId('lit')).toBeTruthy();
  });

  it('lands when the tile itself arrives last', () => {
    function Later() {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        setReady(true);
      }, []);
      return ready ? <TileAskingOnMount /> : null;
    }
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <Later />
        </NavigatorView>
      </NavigatorRoot>,
    );
    expect(screen.getByTestId('lit')).toBeTruthy();
  });
});

function rowHolding(id: string): SpatialNavigator {
  const nav = new SpatialNavigator();
  nav.registerNode('row', { orientation: 'horizontal' });
  nav.registerNode(id, { parent: 'row', focusable: true });
  return nav;
}

describe('the focus queue', () => {
  it('lands a claim at once on a tree that already holds the node', () => {
    const nav = rowHolding('here');
    const queue = focusQueue(nav);

    queue.claim('here');

    expect(nav.focusedId).toBe('here');
  });

  it('keeps an ask a flush could not land, and lands it on the next one', () => {
    const nav = rowHolding('here');
    const queue = focusQueue(nav);
    queue.request('late');
    queue.flush();
    nav.registerNode('late', { parent: 'row', focusable: true });

    queue.flush();

    expect(nav.focusedId).toBe('late');
  });

  it('drops a claim rather than pulling the focus off what took it', () => {
    const nav = rowHolding('here');
    const queue = focusQueue(nav);
    queue.claim('late');
    nav.focus('here');
    nav.registerNode('late', { parent: 'row', focusable: true });

    queue.flush();

    expect(nav.focusedId).toBe('here');
  });

  it('lands a request, which outranks whatever took the focus since', () => {
    const nav = rowHolding('here');
    const queue = focusQueue(nav);
    queue.request('late');
    nav.focus('here');
    nav.registerNode('late', { parent: 'row', focusable: true });

    queue.flush();

    expect(nav.focusedId).toBe('late');
  });
});
