// @vitest-environment jsdom

import {
  DefaultFocus,
  NavigatorItem,
  NavigatorRoot,
  NavigatorView,
  type NodeHandle,
} from '@kroma/spatial-nav/react';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

function Tile({ id }: Readonly<{ id: string }>) {
  return <NavigatorItem>{({ focused }) => <View testID={focused ? 'lit' : id} />}</NavigatorItem>;
}

function EntryTile({ id }: Readonly<{ id: string }>) {
  const entry = useRef<NodeHandle>(null);
  useEffect(() => {
    entry.current?.focus();
  }, []);
  return (
    <NavigatorItem ref={entry}>
      {({ focused }) => <View testID={focused ? 'lit' : id} />}
    </NavigatorItem>
  );
}

describe('an imperative focus', () => {
  it('lands when it is asked for in the same commit as the registration', () => {
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <Tile id="a" />
          <EntryTile id="b" />
        </NavigatorView>
      </NavigatorRoot>,
    );

    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('leaves exactly one item lit', () => {
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <Tile id="a" />
          <EntryTile id="b" />
        </NavigatorView>
      </NavigatorRoot>,
    );

    expect(screen.queryAllByTestId('lit')).toHaveLength(1);
  });

  it('outranks a <DefaultFocus> that claimed after it', () => {
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <EntryTile id="b" />
          <DefaultFocus>
            <Tile id="c" />
          </DefaultFocus>
        </NavigatorView>
      </NavigatorRoot>,
    );

    expect(screen.queryByTestId('b')).toBeNull();
  });
});
