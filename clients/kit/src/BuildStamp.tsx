// The line under the story tree: which build of the kit you are looking at.
//
// It exists because the kit is a thing people are SENT - a deployed site, a
// TestFlight build, a simulator someone else launched - and "the buttons look
// wrong" is unanswerable without knowing which build did the looking. Two lines,
// dim, out of the way: it is a footnote, not a feature.
//
// Where the values come from is the bundler's business, not this file's; see
// buildInfo.ts / buildInfo.web.ts, of which each toolchain takes one.

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

/** Date only, no clock, and nothing at all when it will not parse: this sits in
 * 11pt in a 240pt column, so it is deliberately terser than the shared
 * `formatBuildDate` the About screens use. */
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
