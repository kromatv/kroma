import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { spacing, type } from '#mobile/lib/theme';

export function ProfileSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  const s = useStyles(sDefinition);

  return (
    <Box style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </Box>
  );
}

const sDefinition = styles({
  section: { gap: spacing.xs },
  sectionTitle: { ...type.small, pl: 2, mb: 2, textTransform: 'uppercase', letterSpacing: 1 },
});
