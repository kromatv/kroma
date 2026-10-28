// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type FocusOwner, usePlatformFocus } from '#ui/lib/focus-platform';
import { onScreen, wearsRing } from '#ui/testing';
import { Focusable } from './focusable';

afterEach(cleanup);

function Chrome({ owner }: Readonly<{ owner: FocusOwner | null }>) {
  usePlatformFocus(owner);
  return null;
}

function scene(owner: FocusOwner | null) {
  return onScreen(
    <>
      <Chrome owner={owner} />
      <Focusable label="Poster" focused onPress={() => {}} />
    </>,
    { remote: true },
  );
}

const poster = () => screen.getByRole('button', { name: 'Poster' });

describe('a focused control while a platform chrome is up', () => {
  it('draws no ring while the platform holds the focus', () => {
    render(scene('platform'));

    expect(wearsRing(poster())).toBe(false);
  });

  it('draws its ring again once the app has the focus back', () => {
    const { rerender } = render(scene('platform'));

    rerender(scene('app'));

    expect(wearsRing(poster())).toBe(true);
  });

  it('draws its ring with no chrome up at all', () => {
    render(scene(null));

    expect(wearsRing(poster())).toBe(true);
  });
});
