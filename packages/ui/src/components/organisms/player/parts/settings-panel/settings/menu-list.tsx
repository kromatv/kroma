// The settings menu, rendered.
//
// `moved` is how many of the entries are controls the transport row could not
// fit: they come first, under their own eyebrow and above a gap, so an action
// and a setting never read as one undifferentiated list.

import { Fragment } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useT } from '#ui/services/i18n';
import { playerStyle } from '../../../lib/style';
import type { Entry } from './entries';
import { MenuRow } from './menu-row';

export function MenuList({
  entries,
  moved,
  focused,
  onFocus,
  px,
}: Readonly<{
  entries: readonly Entry[];
  moved: number;
  focused: number;
  onFocus: (index: number) => () => void;
  /** The chrome's scaler (see ../../lib/metrics). */
  px: (n: number) => number;
}>) {
  const t = useT();
  return (
    <Box gap={px(12)}>
      {entries.map((e, i) => (
        <Fragment key={e.id}>
          {moved > 0 && i === 0 ? (
            <Text style={[playerStyle.eyebrow, { fontSize: px(12) }]}>
              {t('player.movedControls')}
            </Text>
          ) : null}
          <MenuRow
            icon={e.icon}
            label={e.label}
            value={e.value}
            toggle={e.toggle}
            on={e.on}
            focused={focused === i}
            onActivate={e.activate}
            onFocus={onFocus(i)}
            style={moved > 0 && i === moved ? { marginTop: px(20) } : undefined}
          />
        </Fragment>
      ))}
    </Box>
  );
}
