import { describe, expect, it } from 'vitest';
import { watchChapters } from './watchable-chapters';

describe('the chapters a seek bar marks', () => {
  it('keeps each chapter where the file puts it, with its title', () => {
    const probe = { chapters: [{ startMs: 0, endMs: 120_000, title: 'Opening' }] };

    expect(watchChapters(probe)).toEqual([{ startMs: 0, endMs: 120_000, title: 'Opening' }]);
  });

  it('reads a chapter the file gives no title as untitled', () => {
    const probe = { chapters: [{ startMs: 120_000, endMs: 240_000, title: null }] };

    expect(watchChapters(probe)[0]?.title).toBe('');
  });

  it('marks nothing for a file with no chapters', () => {
    expect(watchChapters({ chapters: [] })).toEqual([]);
  });
});
