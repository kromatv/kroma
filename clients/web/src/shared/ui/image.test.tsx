// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Image } from './image';

afterEach(() => {
  cleanup();
  window.__KROMA_API__ = undefined;
});

const drawn = () => document.querySelector('img')?.getAttribute('src');

describe('Image', () => {
  it('asks the server it was told about for art the server names by a path', () => {
    window.__KROMA_API__ = 'https://kroma.example.com/';

    render(<Image src="/api/images/tmdb/0f0f/w342/a.jpg" alt="Dune" />);

    expect(drawn()).toBe('https://kroma.example.com/api/images/tmdb/0f0f/w342/a.jpg');
  });

  it('leaves an address that is already whole as it was given', () => {
    window.__KROMA_API__ = 'https://kroma.example.com';

    render(<Image src="https://img.example/p.jpg" alt="Dune" />);

    expect(drawn()).toBe('https://img.example/p.jpg');
  });
});
