// @vitest-environment jsdom

import { useLockNavigator } from '@kroma/spatial-nav/react';
import { cleanup, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, expect, it } from 'vitest';

afterEach(cleanup);

function Surface() {
  const { lock, unlock } = useLockNavigator();
  lock();
  unlock();
  return <Text testID="label">hello</Text>;
}

it('no-ops with no navigator above it, so a dialog still opens on a phone', () => {
  render(<Surface />);

  expect(screen.getByTestId('label')).toBeTruthy();
});
