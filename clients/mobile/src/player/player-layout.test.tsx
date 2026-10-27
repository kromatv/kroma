// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, right: 0, bottom: 34, left: 0 }),
}));

import { PlayerLayout } from './player-layout';

afterEach(cleanup);

it('keeps the same video instance and playback state through fullscreen transitions', () => {
  const mounted = vi.fn();
  const released = vi.fn();
  function Video() {
    const [position, setPosition] = useState(0);
    useEffect(() => {
      mounted();
      return released;
    }, []);
    return <button onClick={() => setPosition((value) => value + 10)}>Video at {position}</button>;
  }
  const layout = (fullscreen: boolean) => (
    <PlayerLayout
      fullscreen={fullscreen}
      video={<Video />}
      header={<span>Player header</span>}
      transport={<span>Playback strip</span>}
      details={<span>Title and tracks</span>}
    >
      <span>Panels</span>
    </PlayerLayout>
  );
  const { rerender, unmount } = render(layout(false));
  fireEvent.click(screen.getByRole('button', { name: 'Video at 0' }));
  rerender(layout(true));
  expect(screen.getByRole('button', { name: 'Video at 10' })).toBeTruthy();
  expect(screen.queryByText('Player header')).toBeNull();
  expect(screen.queryByText('Playback strip')).toBeNull();
  expect(screen.getByText('Panels')).toBeTruthy();
  rerender(layout(false));
  expect(screen.getByRole('button', { name: 'Video at 10' })).toBeTruthy();
  expect(screen.getByText('Title and tracks')).toBeTruthy();
  expect(mounted).toHaveBeenCalledOnce();
  expect(released).not.toHaveBeenCalled();
  unmount();
  expect(released).toHaveBeenCalledOnce();
});
