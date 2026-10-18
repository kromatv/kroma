import { describe, expect, it } from 'vitest';
import type { JudgedFile } from './judgement-schemas';
import { evaluation } from './rules.fixtures';
import { upgradeScope } from './upgrade-scope';

function file(season: number | null, episode: number | null, belowTarget = true): JudgedFile {
  return {
    fileId: `${season}-${episode}`,
    season,
    episode,
    evaluation: evaluation('webdl-720p', 1),
    belowTarget,
  };
}

describe('upgradeScope', () => {
  it('searches the film', () => {
    expect(upgradeScope('movie', [file(null, null)])).toEqual({ scope: 'movie' });
  });

  it('searches the one episode under the goal', () => {
    expect(upgradeScope('show', [file(1, 1), file(1, 2, false)])).toEqual({
      scope: 'episode',
      season: 1,
      episode: 1,
    });
  });

  it('searches the season holding every episode under the goal', () => {
    expect(upgradeScope('show', [file(1, 1), file(1, 4)])).toEqual({ scope: 'season', season: 1 });
  });

  it('searches the season of a file spanning two episodes', () => {
    const double = { ...file(2, 4), episodeEnd: 5 };

    expect(upgradeScope('show', [double])).toEqual({ scope: 'season', season: 2 });
  });

  it('searches the whole show when the files sit in several seasons', () => {
    expect(upgradeScope('show', [file(1, 1), file(2, 3)])).toEqual({ scope: 'all' });
  });
});
