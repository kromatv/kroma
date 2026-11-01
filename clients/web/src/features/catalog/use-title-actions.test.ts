// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTitleActions } from './use-title-actions';

const TITLE = 'm1' as never;

const mocks = vi.hoisted(() => ({
  listed: false,
  watched: false,
  toggle: vi.fn(),
  toggleWatched: vi.fn(),
}));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/shared/lib/mylist', () => ({
  useMyList: () => ({ inList: () => mocks.listed, toggle: mocks.toggle }),
}));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({ isWatched: () => mocks.watched, toggleWatched: mocks.toggleWatched }),
}));

const actions = () => renderHook(() => useTitleActions()).result.current;

beforeEach(() => {
  mocks.listed = false;
  mocks.watched = false;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('useTitleActions', () => {
  it('offers to add a title that is not on the list, and says when it has', () => {
    expect(actions().list(TITLE)).toMatchObject({
      label: 'content.addToList',
      icon: 'bookmark',
      done: 'content.addedToList',
    });
  });

  it('offers to remove a title that is on the list, and says when it has', () => {
    mocks.listed = true;

    expect(actions().list(TITLE)).toMatchObject({
      label: 'content.removeFromList',
      icon: 'bookmark-off',
      done: 'content.removedFromList',
    });
  });

  it('toggles the title on the list', () => {
    void actions().list(TITLE).run?.();

    expect(mocks.toggle).toHaveBeenCalledWith(TITLE);
  });

  it('offers to mark an unwatched title watched, and says when it has', () => {
    expect(actions().watched(TITLE)).toMatchObject({
      label: 'content.markWatched',
      icon: 'eye',
      done: 'content.markedWatched',
    });
  });

  it('offers to mark a watched title unwatched, and says when it has', () => {
    mocks.watched = true;

    expect(actions().watched(TITLE)).toMatchObject({
      label: 'content.markUnwatched',
      icon: 'eye-off',
      done: 'content.markedUnwatched',
    });
  });

  it('toggles whether the title was watched', () => {
    void actions().watched(TITLE).run?.();

    expect(mocks.toggleWatched).toHaveBeenCalledWith(TITLE);
  });
});
