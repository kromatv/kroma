import { useT } from '@kromatv/ui';
import { Box, FocusColumn, styles, Text, useStyles } from '@kromatv/ui/kit';
import { SettingsRows } from '../SettingsRows';
import type { SettingsPane } from './panes';

/** The right pane: the rows of the group the left pane is on, or what its action does. */
export function PaneDetail({ pane }: Readonly<{ pane: SettingsPane }>) {
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
          <SettingsRows items={pane.group.items} entry={false} />
        </FocusColumn>
      ) : (
        <Text variant="bodyTv" color="textDim" style={s.description}>
          {t(pane.description)}
        </Text>
      )}
    </Box>
  );
}

const sDefinition = styles({
  pane: { flex: true, pl: 72, pr: 120, pt: 136 },
  rows: { gap: 12, maxW: 920 },
  description: { maxW: 720 },
});
