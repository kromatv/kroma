// @vitest-environment jsdom

import { NavigatorNode, NavigatorView } from '@kroma/spatial-nav/react';
import { cleanup, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

describe('a container with no navigator above it', () => {
  it('renders a node as its children', () => {
    render(
      <NavigatorNode>
        <Text testID="label">hello</Text>
      </NavigatorNode>,
    );

    expect(screen.getByTestId('label')).toBeTruthy();
  });

  it('tells a render prop it holds no focus', () => {
    render(
      <NavigatorNode>
        {({ active }) => <Text testID={active ? 'held' : 'idle'}>hello</Text>}
      </NavigatorNode>,
    );

    expect(screen.getByTestId('idle')).toBeTruthy();
  });

  it('renders a view as the box it would have been', () => {
    render(
      <NavigatorView direction="horizontal">
        <Text testID="label">hello</Text>
      </NavigatorView>,
    );

    expect(screen.getByTestId('label')).toBeTruthy();
  });
});
