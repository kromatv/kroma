// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type FocusDirection,
  type FocusOwner,
  PlatformFocusProvider,
  usePlatformFocus,
  usePlatformFocusHost,
} from '#ui/lib/focus-platform';

afterEach(cleanup);

// The navigator's end of the wire, captured as the scope renders.
let handled: (direction: string) => void = () => {};

function Chrome({
  owner,
  onEdge,
}: Readonly<{ owner: FocusOwner | null; onEdge?: (direction: FocusDirection) => void }>) {
  usePlatformFocus(owner, onEdge);
  return null;
}

function Scope({
  chrome = true,
  owner = 'platform',
  onEdge,
}: Readonly<{
  chrome?: boolean;
  owner?: FocusOwner | null;
  onEdge?: (direction: FocusDirection) => void;
}>) {
  const platform = usePlatformFocusHost();
  handled = platform.onEdge;
  return (
    <PlatformFocusProvider value={platform.host}>
      <Text testID="owner">{platform.owner ?? 'none'}</Text>
      {chrome ? <Chrome owner={owner} onEdge={onEdge} /> : null}
    </PlatformFocusProvider>
  );
}

const owner = () => screen.getByTestId('owner').textContent;

describe('a platform chrome inside a focus scope', () => {
  it('leaves the scope to itself while no chrome is up', () => {
    render(<Scope chrome={false} />);
    expect(owner()).toBe('none');
  });

  it('says which engine holds the focus, and follows it over', () => {
    const { rerender } = render(<Scope owner="platform" />);
    expect(owner()).toBe('platform');

    rerender(<Scope owner="app" />);
    expect(owner()).toBe('app');
  });

  it('gives the scope back when the chrome unmounts', () => {
    const { rerender } = render(<Scope owner="platform" />);
    rerender(<Scope chrome={false} />);
    expect(owner()).toBe('none');
  });

  it('hands the chrome the four directions and nothing else', () => {
    const onEdge = vi.fn();
    render(<Scope onEdge={onEdge} />);

    handled('left');
    handled('up');
    expect(onEdge.mock.calls).toEqual([['left'], ['up']]);

    // The navigator's own vocabulary is wider than a chrome's: a select, a held
    // select and the unspecified direction all reach this callback.
    handled('enter');
    handled('long_enter');
    handled('*');
    expect(onEdge).toHaveBeenCalledTimes(2);
  });

  it('is silent when no chrome is listening', () => {
    render(<Scope chrome={false} />);
    expect(() => handled('left')).not.toThrow();
  });
});
