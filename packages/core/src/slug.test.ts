import { describe, expect, it } from 'vitest';
import { slugify } from './slug';
import cases from './slug.fixture.json';

describe('slugify', () => {
  it.each(cases)('folds "$name" to "$slug"', ({ name, slug }) => {
    expect(slugify(name)).toBe(slug);
  });

  it('is idempotent, so a slug read back off a URL folds to itself', () => {
    for (const { slug } of cases) expect(slugify(slug)).toBe(slug);
  });
});
