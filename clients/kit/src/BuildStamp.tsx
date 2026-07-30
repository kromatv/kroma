// The line under the story tree: which build of the kit you are looking at.
// Two lines, dim, out of the way - a footnote, not a feature. Values come
// from buildInfo.ts / buildInfo.web.ts, one per toolchain.

import { commitLabel } from '@kroma/core';
import { Box, Txt } from '@kroma/ui/kit';
import { BUILD } from './buildInfo';

export function BuildStamp() {
  const version = BUILD.version ? `v${BUILD.version}` : null;
  // The commit is flagged when the tree it was built from had uncommitted
  // changes, since that hash alone no longer describes what is running.
  const commit = commitLabel(BUILD.commit, BUILD.dirty);
  // Nothing known at all (a dist built somewhere this never ran): draw nothing
  // rather than an empty rule.
  if (!version && !commit) return null;
  return (
    <Box gap={2}>
      <Txt color="textDim" style={LINE}>
        {[version, commit].filter(Boolean).join(' · ')}
      </Txt>
      <Txt color="textDim" style={LINE}>
        {[formatBuildDate(BUILD.buildDate), BUILD.branch].filter(Boolean).join(' · ')}
      </Txt>
    </Box>
  );
}

const LINE = { fontSize: 11, fontWeight: '500' as const };

// Date only, no clock: deliberately terser than the shared formatBuildDate,
// since this sits in 11pt in a 240pt column.
function formatBuildDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
