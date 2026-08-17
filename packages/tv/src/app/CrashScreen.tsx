import { useT } from '@kroma/ui';
import { Box, Icon, Text } from '@kroma/ui/kit';

/** The fallback shown by [`CrashBoundary`] when the app tree throws while
 * rendering. Drawn with the kit so it renders on the native TV clients. */
export function CrashScreen() {
  const t = useT();
  return (
    <Box fill center gap={16} px={64} bg="surface1">
      <Icon name="alert-triangle" size={48} color="textDim" />
      <Text variant="titleTv" textAlign="center">
        {t('crash.title')}
      </Text>
      <Text variant="bodyTv" color="textDim" textAlign="center">
        {t('crash.body')}
      </Text>
    </Box>
  );
}
