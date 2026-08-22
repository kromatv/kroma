// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PosterCard } from './poster-card';
import { TINT } from './poster-card.fixtures';

afterEach(cleanup);

describe('PosterCard', () => {
  it('sits the kind above the title rather than beside it', () => {
    render(<PosterCard title="Obsession" overline="Film" art={null} tint={TINT} />);

    const kind = screen.getByText('Film');
    const title = screen.getByText('Obsession');

    expect(kind.parentElement).toBe(title.parentElement);
    expect(getComputedStyle(kind.parentElement as Element).flexDirection).not.toBe('row');
  });

  it('cases the kind itself, so a caller passes it as it reads', () => {
    render(<PosterCard title="Obsession" overline="Film" art={null} tint={TINT} />);

    expect(getComputedStyle(screen.getByText('Film')).textTransform).toBe('uppercase');
  });

  it('leaves the title alone when the tile names no kind', () => {
    render(<PosterCard title="Obsession" art={null} tint={TINT} />);

    expect(screen.getByText('Obsession')).toBeDefined();
    expect(screen.queryByText('Film')).toBeNull();
  });
});
