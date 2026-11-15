import { useT } from '@kromatv/ui';
import { Box, Text } from '@kromatv/ui/kit';

/** The rule between the two groups of a sign-in screen. */
export function OrRule() {
  const t = useT();
  return (
    <Box row align="center" gap={14} w="100%" accessibilityRole="none">
      <Box flex={1} h={1} bg="border" />
      <Text variant="meta" color="textDim">
        {t('auth.or')}
      </Text>
      <Box flex={1} h={1} bg="border" />
    </Box>
  );
}
