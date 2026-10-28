import { type StyleScope, sharedStyle, useStyleScope, useStyles } from '#ui/core';
// The settings menu, rendered.
//
// `moved` is how many of the entries are controls the transport row could not
// fit: they come first, under their own eyebrow and above a gap, so an action
// and a setting never read as one undifferentiated list.

import { Fragment } from 'react';
import { Text } from '#ui/components/atoms/text';
import { playerStyle } from '#ui/components/organisms/player/lib/style';
import { FocusColumn } from '#ui/lib/focus-scope';

import { useT } from '#ui/services/i18n';
import type { Entry } from './entries';
import { MenuRow } from './menu-row';

const sizeOf = (fontSize: number, scope: StyleScope) =>
  sharedStyle(`menu-list:size:${fontSize}`, { fontSize }, scope);

const gapOf = (marginTop: number, scope: StyleScope) =>
  sharedStyle(`menu-list:gap:${marginTop}`, { marginTop }, scope);
export function MenuList({
  entries,
  moved,
  px,
}: Readonly<{
  entries: readonly Entry[];
  moved: number;
  /** The chrome's scaler (see ../../lib/metrics). */
  px: (n: number) => number;
}>) {
  const playerStyleScoped = useStyles(playerStyle);

  const scope = useStyleScope();

  const t = useT();
  return (
    <FocusColumn style={{ gap: px(12) }}>
      {entries.map((e, i) => (
        <Fragment key={e.id}>
          {moved > 0 && i === 0 ? (
            <Text style={[playerStyleScoped.eyebrow, sizeOf(px(12), scope)]}>
              {t('player.movedControls')}
            </Text>
          ) : null}
          <MenuRow
            icon={e.icon}
            label={e.label}
            value={e.value}
            toggle={e.toggle}
            on={e.on}
            autoFocus={i === 0}
            onActivate={e.activate}
            style={moved > 0 && i === moved ? gapOf(px(20), scope) : undefined}
          />
        </Fragment>
      ))}
    </FocusColumn>
  );
}
