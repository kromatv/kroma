import { useT } from '@kroma/ui';
import { Box, Button, FocusScope, Icon, Text } from '@kroma/ui/kit';

interface CrashScreenProps {
  /** Clears the boundary and renders the tree again. */
  onRetry: () => void;
  /** Absent at the root of the stack, where there is nowhere to go back to. */
  onBack?: () => void;
}

/**
 * The fallback shown by [`CrashBoundary`] when the app tree throws while
 * rendering. Drawn with the kit so it renders on the native TV clients, and it
 * carries its own <FocusScope>: what crashed is the router underneath, so there
 * is no scope left for the remote to reach these two controls through.
 */
export function CrashScreen({ onRetry, onBack }: Readonly<CrashScreenProps>) {
  const t = useT();
  return (
    <FocusScope>
      <Box fill center gap={16} px={64} bg="surface1">
        <Icon name="alert-triangle" size={48} color="textDim" />
        <Text variant="titleTv" textAlign="center">
          {t('crash.title')}
        </Text>
        <Text variant="bodyTv" color="textDim" textAlign="center">
          {t('crash.body')}
        </Text>
        <Box row gap={16} pt={16}>
          <Button autoFocus icon="refresh" label={t('error.retry')} onPress={onRetry} />
          {onBack ? (
            <Button variant="outline" icon="arrow-left" label={t('common.back')} onPress={onBack} />
          ) : null}
        </Box>
      </Box>
    </FocusScope>
  );
}
