import { describe, expect, it } from 'vitest';
import { pageTitle, titled } from './page-title';

describe('pageTitle', () => {
  it('names the page first and the site last', () => {
    expect(pageTitle('about', 'French', 'o/r')).toBe('about · French · o/r · Lingua');
  });

  it('is the site alone for a page with nothing to name, and skips an empty part', () => {
    expect([pageTitle(), pageTitle('', 'o/r')]).toEqual(['Lingua', 'o/r · Lingua']);
  });
});

describe('titled', () => {
  it('is a head whose only meta is the title', () => {
    expect(titled('Status')).toEqual({ meta: [{ title: 'Status · Lingua' }] });
  });
});
