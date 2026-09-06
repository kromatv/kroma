// @vitest-environment jsdom
import { posterColors, posterGradient } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { posterScrim, posterWash, wash } from './art-styles';

const flat = (style: object) => style as Record<string, unknown>;

describe('art styles', () => {
  it('registers one wash per colour pair and angle, and shares it', () => {
    const a = wash('#111111', '#222222');
    expect(flat(a).backgroundImage).toBe('linear-gradient(158deg, #111111, #222222)');
    expect(wash('#111111', '#222222')).toBe(a);
    expect(flat(wash('#111111', '#222222', 90)).backgroundImage).toBe(
      'linear-gradient(90deg, #111111, #222222)',
    );
  });

  it('derives a title wash from the id the poster colours come from', () => {
    const [c1, c2] = posterColors('tt0133093');
    expect(flat(posterWash('tt0133093')).backgroundImage).toBe(
      `linear-gradient(158deg, ${c1}, ${c2})`,
    );
    expect(posterWash('tt0133093')).toBe(wash(c1, c2));
  });

  it('registers the key-art scrim once per title', () => {
    const scrim = posterScrim('The Matrix');
    expect(flat(scrim).backgroundImage).toBe(posterGradient('The Matrix'));
    expect(posterScrim('The Matrix')).toBe(scrim);
  });
});
