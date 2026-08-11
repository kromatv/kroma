// The server list of the onboarding screens, on the kit's <ListRow.Group>:
// the card, its glass, its hairlines and each row's shape are the design
// system's, so a phone's server list is the same object as the TV's and the
// console's. What stays here is the section header and hint that frame it.

import { Box, ListRow, Spinner, styles, Txt } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { spacing, type } from '#mobile/lib/theme';

/** The card the rows stack in. */
export const ServerList = ListRow.Group;

export function ServerRow({
  name,
  host,
  icon,
  disabled,
  dimmed,
  onPress,
}: Readonly<{
  name: string;
  host?: string | null;
  icon?: ReactNode;
  disabled?: boolean;
  dimmed?: boolean;
  onPress(): void;
}>) {
  return (
    <ListRow
      size="sm"
      label={name}
      hint={host ?? undefined}
      leading={icon}
      disabled={disabled}
      onPress={onPress}
      style={dimmed ? s.dimmed : undefined}
    />
  );
}

/** Uppercase section header; `loading` appends a small spinner (live scan). */
export function ServerSectionHeader({
  title,
  loading,
}: Readonly<{ title: string; loading?: boolean }>) {
  return (
    <Box style={s.sectionHeader}>
      <Txt style={s.sectionTitle}>{title}</Txt>
      {loading ? <Spinner size={18} color="textDim" /> : null}
    </Box>
  );
}

export function ServerSectionHint({ children }: Readonly<{ children: string }>) {
  return <Txt style={s.sectionHint}>{children}</Txt>;
}

const s = styles({
  // A row the list shows but cannot be used yet (an offline server).
  dimmed: { opacity: 0.5 },
  sectionHeader: { row: true, align: 'center', gap: 10, px: spacing.xs },
  sectionTitle: { ...type.small, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionHint: { ...type.small, px: spacing.xs },
});

export type { ListRowProps as ServerRowProps } from '@kroma/ui/kit';
