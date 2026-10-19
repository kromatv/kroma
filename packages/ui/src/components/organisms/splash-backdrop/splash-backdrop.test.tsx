// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplashBackdrop } from './splash-backdrop';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const COVERS = [
  { url: '/api/images/a.webp', caption: 'Alien · 1979', eyebrow: 'Film' },
  { url: '/api/images/b.webp', caption: 'Dune · 2021', eyebrow: 'Film' },
];

describe('SplashBackdrop', () => {
  it('renders the first cover with its caption', () => {
    const { getByText, container } = render(<SplashBackdrop covers={COVERS} />);
    expect(getByText('Alien · 1979')).toBeTruthy();
    expect(getByText('Film')).toBeTruthy();
    expect(container.querySelector('img')?.src).toContain('/api/images/a.webp');
  });

  it('keeps the leaving cover under the next one while it dissolves, then lets it go', () => {
    vi.useFakeTimers();
    const { container } = render(<SplashBackdrop covers={COVERS} holdMs={10_000} />);
    const sources = () => [...container.querySelectorAll('img')].map((img) => img.src);

    act(() => vi.advanceTimersByTime(10_000));

    expect(sources()).toEqual([
      expect.stringContaining('/api/images/a.webp'),
      expect.stringContaining('/api/images/b.webp'),
    ]);

    act(() => vi.advanceTimersByTime(3000));

    expect(sources()).toEqual([expect.stringContaining('/api/images/b.webp')]);
  });

  it('renders nothing without covers', () => {
    const { container } = render(<SplashBackdrop covers={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
