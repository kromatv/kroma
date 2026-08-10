// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { preconnect } from './base';

afterEach(() => {
  for (const link of [...document.head.querySelectorAll('link')]) link.remove();
});

describe('preconnect', () => {
  it('hints the server ORIGIN, anonymously, whatever path it was given', () => {
    preconnect('http://nas:4040/api/items');
    const link = document.head.querySelector('link[rel="preconnect"]');
    expect(link?.getAttribute('href')).toBe('http://nas:4040');
    expect(link?.getAttribute('crossorigin')).toBe('anonymous');
  });

  it('adds nothing a second time for the same origin', () => {
    preconnect('http://nas:4040');
    preconnect('http://nas:4040/api');
    expect(document.head.querySelectorAll('link[rel="preconnect"]')).toHaveLength(1);
  });

  it('ignores an address that is not a URL', () => {
    preconnect('not a url');
    expect(document.head.querySelectorAll('link[rel="preconnect"]')).toHaveLength(0);
  });
});
