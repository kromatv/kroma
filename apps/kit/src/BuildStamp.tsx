import { commitLabel } from '@kroma/core';
import { Box, Txt } from '@kroma/ui/kit';
import { BUILD } from './buildInfo';

export function BuildStamp() {
  const version = BUILD.version ? `v${BUILD.version}` : null;
  const commit = commitLabel(BUILD.commit, BUILD.dirty);
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
