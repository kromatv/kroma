import type { SettingRow } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { memo } from 'react';
import { Control } from './control';

const sDefinition = styles({ minW: { minWidth: 0 }, desc: { mt: 3 }, saved: { mt: 4 } });

// Memoised: `applySetting` rebuilds every group and every row array on each
// edit, so without this boundary one keystroke re-rendered every row on the
// page rather than the one that changed.
export const Row = memo(function Row({
  row,
  onChange,
}: Readonly<{ row: SettingRow; onChange: (key: string, v: unknown) => void }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const change = (v: unknown) => onChange(row.key, v);
  return (
    <Box row align="center" justify="space-between" gap={20} px={22} py={16}>
      <Box shrink={1} style={s.minW}>
        <Text variant="label">{row.label}</Text>
        {row.desc ? (
          <Text variant="meta" color="textDim" style={s.desc}>
            {row.desc}
          </Text>
        ) : null}
        {!row.applied && row.kind !== 'value' ? (
          <Text variant="overline" color="text/30" style={s.saved}>
            {t('admin.prefSaved')}
          </Text>
        ) : null}
      </Box>
      <Control row={row} onChange={change} />
    </Box>
  );
});
