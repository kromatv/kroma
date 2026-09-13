import type { Release, ReleasesView } from '@kromatv/client/releases';
import { describe, expect, it } from 'vitest';
import { nextStep, whatsNewRelease } from './whatsNew';

function release(version: string): Release {
  return {
    version,
    action: [],
    highlights: [{ title: `New in ${version}`, body: 'One paragraph.' }],
    fixed: [],
    owner: [],
  };
}

function view(current: string, unseen: string | null, versions: string[]): ReleasesView {
  return { current, unseen, releases: versions.map(release) };
}

describe('whatsNewRelease', () => {
  it('opens on the release the reader has not been shown yet', () => {
    const releases = view('0.1.39', '0.1.38', ['0.1.39', '0.1.38']);

    const shown = whatsNewRelease(releases);

    expect(shown?.version).toBe('0.1.38');
  });

  it('falls back to the running version once every release was shown', () => {
    const releases = view('0.1.39', null, ['0.1.39', '0.1.38']);

    const shown = whatsNewRelease(releases);

    expect(shown?.version).toBe('0.1.39');
  });

  it('falls back to the newest notes when the running version has none', () => {
    const releases = view('0.1.40', null, ['0.1.39', '0.1.38']);

    const shown = whatsNewRelease(releases);

    expect(shown?.version).toBe('0.1.39');
  });

  it('has nothing to show when the server carries no notes', () => {
    const releases = view('0.1.39', null, []);

    const shown = whatsNewRelease(releases);

    expect(shown).toBeNull();
  });
});

describe('nextStep', () => {
  it('moves on to the next highlight', () => {
    const step = nextStep(0, 3);

    expect(step).toEqual({ kind: 'show', index: 1 });
  });

  it('closes the screen from the last highlight', () => {
    const step = nextStep(2, 3);

    expect(step).toEqual({ kind: 'close' });
  });

  it('closes a release of one highlight on the first press', () => {
    const step = nextStep(0, 1);

    expect(step).toEqual({ kind: 'close' });
  });
});
