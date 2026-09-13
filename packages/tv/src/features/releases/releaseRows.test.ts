import type { Release } from '@kromatv/client/releases';
import { describe, expect, it } from 'vitest';
import { releaseRows } from './releaseRows';

const POSTPLAY = {
  title: 'When a film ends, another is ready',
  body: 'The player shows the title closest to the one you just watched.',
};
const LANGUAGE = {
  title: 'Titles follow your language',
  body: 'Each account reads titles and synopses in its own language.',
};

function release(notes: Partial<Release>): Release {
  return { version: '0.1.39', action: [], highlights: [], fixed: [], owner: [], ...notes };
}

describe('releaseRows', () => {
  it('lists the highlights in order, then the fixes, then the owner lines', () => {
    const notes = release({
      highlights: [POSTPLAY, LANGUAGE],
      fixed: ['A paused film no longer starts again on its own.'],
      owner: ['Watch history has its own screen.'],
    });

    const rows = releaseRows(notes);

    expect(rows).toEqual([
      { kind: 'highlight', highlight: POSTPLAY },
      { kind: 'highlight', highlight: LANGUAGE },
      { kind: 'fixed', lines: ['A paused film no longer starts again on its own.'] },
      { kind: 'owner', lines: ['Watch history has its own screen.'] },
    ]);
  });

  it('leaves out the fixes of a release that fixed nothing', () => {
    const notes = release({ highlights: [POSTPLAY], owner: ['Requests land in Requests.'] });

    const rows = releaseRows(notes);

    expect(rows.map((row) => row.kind)).toEqual(['highlight', 'owner']);
  });

  it('leaves out the owner lines the server withheld from this reader', () => {
    const notes = release({
      highlights: [POSTPLAY],
      fixed: ['The sign-in screen no longer crashes.'],
    });

    const rows = releaseRows(notes);

    expect(rows.map((row) => row.kind)).toEqual(['highlight', 'fixed']);
  });

  it('opens on the fixes of a release with no highlights', () => {
    const notes = release({
      fixed: ['A count shows as a badge.'],
      owner: ['The log fills its window.'],
    });

    const rows = releaseRows(notes);

    expect(rows.map((row) => row.kind)).toEqual(['fixed', 'owner']);
  });
});
