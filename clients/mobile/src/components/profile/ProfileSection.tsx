import { Box, styles, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { spacing, type } from '#mobile/lib/theme';

export function ProfileSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Box style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </Box>
  );
}

const s = styles({
  section: { gap: spacing.xs },
  sectionTitle: { ...type.small, pl: 2, mb: 2, textTransform: 'uppercase', letterSpacing: 1 },
});
