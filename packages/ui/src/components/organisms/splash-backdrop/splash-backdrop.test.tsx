// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SplashBackdrop } from './splash-backdrop';

afterEach(cleanup);

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

  it('renders nothing without covers', () => {
    const { container } = render(<SplashBackdrop covers={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
