import { Box, Text } from '@kromatv/ui/kit';

/** A row's title, with the quieter line the server sometimes says about it.
 * Still an `<h2>`: `<Text accessibilityRole>` can only render an `h1`. */
export function SectionHeading({
  title,
  reason,
}: Readonly<{ title: string; reason?: string | null }>) {
  return (
    <Box mt={40} mb={20} gap={4}>
      <h2>
        <Text variant="h2">{title}</Text>
      </h2>
      {reason ? (
        <Text variant="meta" color="textMuted">
          {reason}
        </Text>
      ) : null}
    </Box>
  );
}
