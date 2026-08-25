import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';

export function Card({ label, tone }: Readonly<{ label: string; tone: 'accent' | 'textMuted' }>) {
  return (
    <Box px={16} py={12} radius="lg" bg="surface1" border="border">
      <Text variant="label" color={tone}>
        {label}
      </Text>
    </Box>
  );
}
