// @vitest-environment jsdom
import { I18nProvider } from '@kroma/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Poster } from './poster';

afterEach(cleanup);

// Unscoped, like the web client: see poster-tile.test.tsx.
function poster(props: { poster?: string | null; caption?: boolean }) {
  return render(
    <I18nProvider locale="en">
      <Poster title="Dune" genre="Sci-fi" {...props} />
    </I18nProvider>,
  );
}

function caption(): Element {
  const box = screen.getByText('Sci-fi').parentElement;
  if (!box) throw new Error('the caption has no box to fade');
  return box;
}

describe('Poster', () => {
  it('hides the caption over artwork worth seeing until the tile is engaged', () => {
    poster({ poster: '/dune.jpg' });

    expect(getComputedStyle(caption()).opacity).toBe('0');
  });

  it('reveals the caption once the tile is engaged', () => {
    poster({ poster: '/dune.jpg' });

    fireEvent.focus(screen.getByLabelText('Dune'));

    expect(getComputedStyle(caption()).opacity).toBe('1');
  });

  it('keeps the caption up with no artwork, since the title is all there is', () => {
    poster({ poster: null });

    expect(getComputedStyle(caption()).opacity).toBe('1');
  });

  it('paints no caption for a grid that captions its tiles underneath', () => {
    poster({ poster: '/dune.jpg', caption: false });

    expect(screen.queryByText('Sci-fi')).toBeNull();
  });
});
