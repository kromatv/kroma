// @vitest-environment jsdom

import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWebLink, permalink, WEB_LINK } from './link';

afterEach(() => vi.restoreAllMocks());

const REPO = 'https://github.com/maxscharwath/kroma';
const SHA = '9db893fe1a4e0b1c2d3f4a5b6c7d8e9f0a1b2c3d';

describe('permalink', () => {
  it('pins a folder, a file and a commit to the revision', () => {
    expect(permalink(REPO, 'tree', SHA, 'packages/ui/src/button')).toBe(
      `${REPO}/tree/${SHA}/packages/ui/src/button`,
    );
    expect(permalink(REPO, 'blob', SHA, 'guides/01-intro.page.mdx')).toBe(
      `${REPO}/blob/${SHA}/guides/01-intro.page.mdx`,
    );
    expect(permalink(REPO, 'commit', SHA)).toBe(`${REPO}/commit/${SHA}`);
  });

  it('takes a short sha, which is what a log lists', () => {
    expect(permalink(REPO, 'commit', 'c51eb48')).toBe(`${REPO}/commit/c51eb48`);
  });

  it('links nothing without a revision it can pin to', () => {
    // An unpinned link points at whatever the default branch has drifted to,
    // which is not the code being read.
    for (const rev of [null, '', 'main', 'HEAD', 'v0.1.3', 'nothexadecimal']) {
      expect(permalink(REPO, 'tree', rev, 'packages/ui/src')).toBeNull();
    }
  });

  it('links nothing where the build never named a remote', () => {
    expect(permalink(null, 'commit', SHA)).toBeNull();
  });

  it('wants a path for a folder or a file, and none for a commit', () => {
    expect(permalink(REPO, 'tree', SHA)).toBeNull();
    expect(permalink(REPO, 'blob', SHA, '')).toBeNull();
  });

  it('refuses a remote that is not a web address', () => {
    // The link is handed to `openWebLink`, which opens http(s) alone; a `file:`
    // or an ssh remote would be a button that does nothing.
    expect(permalink('git@github.com:maxscharwath/kroma', 'commit', SHA)).toBeNull();
    expect(permalink('file:///Users/someone/kroma', 'commit', SHA)).toBeNull();
  });

  it('does not double the slash on a remote written with a trailing one', () => {
    expect(permalink(`${REPO}/`, 'commit', SHA)).toBe(`${REPO}/commit/${SHA}`);
  });
});

describe('openWebLink', () => {
  const opener = () => vi.spyOn(Linking, 'openURL').mockResolvedValue(true);

  it('hands an http(s) address to the platform', () => {
    const openURL = opener();
    openWebLink('https://github.com/maxscharwath/kroma');
    expect(openURL).toHaveBeenCalledWith('https://github.com/maxscharwath/kroma');
  });

  it('opens nothing at all for any other scheme', () => {
    // `openURL` hands whatever it is given to the platform, and this is the only
    // guard between a document's links and it.
    const openURL = opener();
    for (const href of ['javascript:alert(1)', 'file:///etc/passwd', 'kroma://show/1', '']) {
      openWebLink(href);
    }
    expect(openURL).not.toHaveBeenCalled();
  });

  it('swallows a platform that refuses, rather than throwing at the press', () => {
    vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    expect(() => openWebLink('https://kroma.tv')).not.toThrow();
  });
});

describe('WEB_LINK', () => {
  it('is the pair of schemes the workbench ever opens', () => {
    expect(WEB_LINK.test('https://kroma.tv')).toBe(true);
    expect(WEB_LINK.test('http://localhost:3000')).toBe(true);
    // `openURL` hands any scheme to the platform: `javascript:` runs on a
    // webview, `file:` reads the disk.
    expect(WEB_LINK.test('javascript:alert(1)')).toBe(false);
    expect(WEB_LINK.test('file:///etc/passwd')).toBe(false);
  });
});
