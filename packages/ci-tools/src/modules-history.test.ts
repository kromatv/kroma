import { foldHistory, type VersionHistory } from '@kromatv/registry';
import { describe, expect, it } from 'vitest';
import {
  describeRelease,
  type ModuleRelease,
  manifestPath,
  missingReleases,
  type Release,
} from './modules-history';

const DIGEST = `sha256:${'ab'.repeat(32)}`;

function release(tag: string, assets: Release['assets'] = []): Release {
  return { tag_name: tag, draft: false, assets };
}

function kmod(name: string, digest: string | null = DIGEST): Release['assets'][number] {
  return { name, size: 42, browser_download_url: `https://dl/${name}`, digest };
}

const notes: ModuleRelease = {
  id: 'tv.acme.notes',
  version: '0.2.0',
  tag: 'tv.acme.notes@0.2.0',
  artifacts: [
    { target: null, url: 'https://dl/tv.acme.notes.kmod', size: 42, sha256: 'ab'.repeat(32) },
  ],
};

describe('missingReleases', () => {
  it('reads a module release and the bundle GitHub vouches for', () => {
    const missing = missingReleases(
      [
        release('tv.acme.notes@0.2.0', [
          kmod('tv.acme.notes.kmod'),
          kmod('tv.acme.notes.kmod.sha256'),
        ]),
      ],
      null,
    );

    expect(missing).toEqual([notes]);
  });

  it('names the target of a native build', () => {
    const [found] = missingReleases(
      [release('tv.acme.notes@0.1.0', [kmod('tv.acme.notes-aarch64-apple-darwin.kmod')])],
      null,
    );

    expect(found?.artifacts[0]?.target).toBe('aarch64-apple-darwin');
  });

  it('skips the server, canary and catalog releases', () => {
    const missing = missingReleases(
      ['v0.1.38', 'canary', 'modules', 'desktop-latest'].map((tag) =>
        release(tag, [kmod('tv.acme.notes.kmod')]),
      ),
      null,
    );

    expect(missing).toEqual([]);
  });

  it('skips a version the history already describes', () => {
    const history: VersionHistory = foldHistory(
      null,
      [
        {
          schemaVersion: 3,
          id: 'tv.acme.notes',
          name: 'Notes',
          version: '0.2.0',
          artifacts: notes.artifacts,
        },
      ],
      'now',
    );

    const missing = missingReleases(
      [release('tv.acme.notes@0.2.0', [kmod('tv.acme.notes.kmod')])],
      history,
    );

    expect(missing).toEqual([]);
  });

  it('leaves out a release whose bundle carries no digest', () => {
    const missing = missingReleases(
      [release('tv.acme.notes@0.2.0', [kmod('tv.acme.notes.kmod', null)])],
      null,
    );

    expect(missing).toEqual([]);
  });

  it('leaves out a draft', () => {
    const draft = { ...release('tv.acme.notes@0.2.0', [kmod('tv.acme.notes.kmod')]), draft: true };

    expect(missingReleases([draft], null)).toEqual([]);
  });
});

describe('describeRelease', () => {
  it('describes a release with the manifest its tag packed and its bundles', () => {
    const manifest = {
      schemaVersion: 3,
      id: 'tv.acme.notes',
      name: 'Notes',
      version: '0.2.0',
      engines: { server: '>=0.1.38' },
    };

    expect(describeRelease(notes, manifest)).toMatchObject({
      engines: { server: '>=0.1.38' },
      artifacts: notes.artifacts,
    });
  });

  it('refuses a manifest naming another version than the tag', () => {
    const manifest = { schemaVersion: 3, id: 'tv.acme.notes', name: 'Notes', version: '0.3.0' };

    expect(describeRelease(notes, manifest)).toBeNull();
  });

  it('refuses something that is not a manifest', () => {
    expect(describeRelease(notes, { hello: 'world' })).toBeNull();
  });
});

describe('manifestPath', () => {
  it('finds a module manifest in its own folder', () => {
    expect(manifestPath('tv.acme.notes')).toBe('modules/tv.acme.notes/module.json');
  });
});
