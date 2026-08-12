// The one door out of the workbench to the platform's browser - a doc's links
// and the toolbar's source link - and the permalinks that go through it.

import { Linking } from 'react-native';

// `openURL` hands any scheme it is given to the platform: `javascript:` runs on
// a webview, `file:` reads the disk. The two the workbench ever needs are the
// two allowed.
const WEB_LINK = /^https?:\/\//i;

/** Opens `href` in the platform's browser. A URL that is not http(s) opens
 * nothing at all. */
function openWebLink(href: string): void {
  if (!WEB_LINK.test(href)) return;
  Linking.openURL(href).catch(() => undefined);
}

/** What a permalink points at: a folder, a file, or a commit. */
type LinkTarget = 'tree' | 'blob' | 'commit';

const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * A permalink into `repository`, pinned to `rev`.
 *
 * Null unless the build names both a remote and a real sha: an unpinned link
 * points at whatever the default branch has drifted to, which is not the code
 * being read. A dirty tree still links, at the commit its edits sit on.
 */
function permalink(
  repository: string | null,
  target: LinkTarget,
  rev: string | null,
  path?: string,
): string | null {
  if (!repository || !rev || !SHA.test(rev)) return null;
  if (target !== 'commit' && !path) return null;
  const suffix = path ? `/${path}` : '';
  let base = repository;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const url = `${base}/${target}/${rev}${suffix}`;
  return WEB_LINK.test(url) ? url : null;
}

export { openWebLink, permalink, WEB_LINK };
