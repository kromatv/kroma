import { describe, expect, it } from 'vitest';
import { secondLine } from './second-line';

describe('the second line of what a television plays', () => {
  it('names the show and the episode of an episode', () => {
    expect(secondLine({ showTitle: 'Severance', season: 2, episode: 3 })).toBe('Severance · S2E3');
  });

  it('names only the show when the episode is not numbered', () => {
    expect(secondLine({ showTitle: 'Severance', season: 2 })).toBe('Severance');
  });

  it('is the year of a film', () => {
    expect(secondLine({ year: 1999 })).toBe('1999');
  });

  it('is empty when nothing is known', () => {
    expect(secondLine({})).toBe('');
  });
});
