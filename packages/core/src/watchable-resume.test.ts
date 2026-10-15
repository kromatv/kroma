import type { DownloadId } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import { watchResumeId, watchResumeOf, watchResumeWith } from './watchable-resume';

const DOWNLOAD = 'e0d1521ed289ba35' as DownloadId;
const FILM = watchResumeId(DOWNLOAD, 0);
const OTHER = watchResumeId(DOWNLOAD, 2);

describe('a position worth reopening at', () => {
  const kept = (positionSec: number, durationSec: number) =>
    watchResumeOf(watchResumeWith(null, FILM, positionSec, durationSec), FILM);

  it('reads the first half minute as the beginning', () => {
    expect(kept(29, 600)).toBe(0);
    expect(kept(31, 600)).toBe(31);
  });

  it('reads the last twentieth as the end', () => {
    expect(kept(580, 600)).toBe(0);
  });

  it('keeps a late position of a film whose length nothing measured', () => {
    expect(kept(5_400, 0)).toBe(5_400);
  });
});

describe('the ledger a device keeps for a file with no catalogue row', () => {
  it('names one file of one download, never the download', () => {
    expect(watchResumeId(DOWNLOAD, 2)).toBe('e0d1521ed289ba35:2');
  });

  it('gives back where a file was left and nothing for one never played', () => {
    const stored = watchResumeWith(null, FILM, 640, 6_000);

    expect(watchResumeOf(stored, FILM)).toBe(640);
    expect(watchResumeOf(stored, OTHER)).toBe(0);
  });

  it('takes a file out once it is watched to the end', () => {
    const stored = watchResumeWith(watchResumeWith(null, FILM, 640, 6_000), FILM, 5_900, 6_000);

    expect(watchResumeOf(stored, FILM)).toBe(0);
  });

  it('keeps every file of a pack apart', () => {
    const stored = watchResumeWith(watchResumeWith(null, FILM, 640, 6_000), OTHER, 90, 6_000);

    expect(watchResumeOf(stored, FILM)).toBe(640);
    expect(watchResumeOf(stored, OTHER)).toBe(90);
  });

  it('forgets the oldest stops rather than growing without end', () => {
    let stored = '';
    for (let file = 0; file < 30; file += 1) {
      stored = watchResumeWith(stored, watchResumeId(DOWNLOAD, file), 640, 6_000);
    }

    expect(JSON.parse(stored)).toHaveLength(24);
    expect(watchResumeOf(stored, watchResumeId(DOWNLOAD, 29))).toBe(640);
    expect(watchResumeOf(stored, FILM)).toBe(0);
  });

  it('reads a store another version wrote as an empty ledger', () => {
    expect(watchResumeOf('{oops', FILM)).toBe(0);
    expect(watchResumeOf('[{"id":7}]', FILM)).toBe(0);
  });
});
