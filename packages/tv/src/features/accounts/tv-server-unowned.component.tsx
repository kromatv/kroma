import { useT } from '@kromatv/ui';
import { Box, Button, EmptyState, Text, useFocusNav } from '@kromatv/ui/kit';
import { useServerOwner } from '#tv/app/providers/server-owner';
import { useClient, useNav } from '#tv/app/router';

/**
 * What a television shows in place of a pairing code while its server has no
 * account (route `unowned`): the fact, the address to open in a browser, and
 * the one control, which asks the server again.
 */
export function TvServerUnowned() {
  const t = useT();
  const nav = useNav();
  const client = useClient();
  const { recheck } = useServerOwner();
  useFocusNav({ onBack: nav.back });

  return (
    <Box fill z={10} center px={64} accessibilityRole="alert">
      <EmptyState.Root size="tv" icon="server-off">
        <EmptyState.Title>{t('connect.serverUnownedTitle')}</EmptyState.Title>
        <EmptyState.Hint>{t('connect.serverUnownedHint')}</EmptyState.Hint>
        <Text variant="titleTv" color="accentText" textAlign="center">
          {client.baseUrl}
        </Text>
        <EmptyState.Actions>
          <Button
            autoFocus
            icon="refresh"
            label={t('connect.serverUnownedCheck')}
            onPress={recheck}
          />
        </EmptyState.Actions>
      </EmptyState.Root>
    </Box>
  );
}
