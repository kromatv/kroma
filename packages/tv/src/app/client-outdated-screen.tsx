import { useT } from '@kromatv/ui';
import { Box, FocusScope, Icon, Text } from '@kromatv/ui/kit';
import { CLIENT_BUILD } from '#tv/app/client-build';
import { useConnection } from '#tv/app/providers/connection';

/**
 * The one screen an app too old for its server shows, in place of the
 * features that would each fail on their own. The health probe keeps running
 * behind it, so a server rolled back lets the app through again.
 */
export function ClientOutdatedScreen() {
  const t = useT();
  const { serverVersion } = useConnection();
  return (
    <FocusScope>
      <Box fill center gap={16} px={64} bg="surface1" accessibilityRole="alert">
        <Icon name="alert-triangle" size={48} color="textDim" />
        <Text variant="titleTv" textAlign="center">
          {t('compat.clientOutdatedTitle')}
        </Text>
        <Text variant="bodyTv" color="textDim" textAlign="center">
          {t('compat.clientOutdated', {
            client: CLIENT_BUILD.version,
            server: serverVersion ?? '?',
          })}
        </Text>
        <Text variant="bodyTv" color="textDim" textAlign="center">
          {t('compat.howToUpdateTv')}
        </Text>
      </Box>
    </FocusScope>
  );
}
