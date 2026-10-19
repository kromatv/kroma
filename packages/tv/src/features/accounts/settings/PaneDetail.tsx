import { useT } from '@kromatv/ui';
import { Box, FocusColumn, type FocusHandle, styles, Text, useStyles } from '@kromatv/ui/kit';
import type { RefObject } from 'react';
import { SettingsRows } from '../SettingsRows';
import type { SettingsPane } from './panes';

/** The right pane: the rows of the group the left pane is on, a panel's own
 * content, or what an action does. A new `visit` remounts a panel, so Back out of it resets it. */
export function PaneDetail({
  pane,
  entry,
  visit,
}: Readonly<{ pane: SettingsPane; entry: RefObject<FocusHandle | null>; visit: number }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const title = pane.kind === 'group' ? pane.group.label : pane.label;
  return (
    <Box style={s.pane}>
      <Text variant="titleTv" mb={48}>
        {t(title)}
      </Text>
      {pane.kind === 'group' ? (
        <FocusColumn key={pane.group.id} style={s.rows}>
          <SettingsRows items={pane.group.items} entry={false} firstHandle={entry} />
        </FocusColumn>
      ) : null}
      {pane.kind === 'panel' ? (
        <FocusColumn key={`${pane.id}:${visit}`} style={s.rows}>
          <pane.Panel entry={entry} />
        </FocusColumn>
      ) : null}
      {pane.kind === 'action' ? (
        <Text variant="bodyTv" color="textDim" style={s.description}>
          {t(pane.description)}
        </Text>
      ) : null}
    </Box>
  );
}

const sDefinition = styles({
  pane: { flex: true, pl: 72, pr: 120, pt: 136 },
  rows: { gap: 12, maxW: 920 },
  description: { maxW: 720 },
});
