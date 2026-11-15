import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { spacing, type } from '#mobile/lib/theme';

export function ClipDetails({ title, label }: Readonly<{ title: string; label: string }>) {
  const s = useStyles(definition);
  return (
    <Box style={s.body}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.label}>{label}</Text>
    </Box>
  );
}

const definition = styles({
  body: { flex: true, px: spacing.md, pt: spacing.sm, gap: spacing.sm },
  title: { ...type.title },
  label: { ...type.caption, color: 'text' },
});
