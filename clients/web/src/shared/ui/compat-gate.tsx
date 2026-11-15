import { checkCompat } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Button, Icon, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The routes, or the one screen an app too old for its server shows in their
 * place. A server that has not answered yet, or that predates saying which
 * apps it serves, lets everything through. */
export function CompatGate({ children }: Readonly<{ children: ReactNode }>) {
  const webRuntime = useWebRuntime();
  const { data: health } = useQuery({
    ...webRuntime.queries.serverQueries.health(),
    enabled: webRuntime.app !== undefined,
  });
  const app = webRuntime.app;
  if (!app || !health || checkCompat(app, health) !== 'client-outdated') {
    return children;
  }
  return <ClientOutdated client={app.version} server={health.version} />;
}

function ClientOutdated({ client, server }: Readonly<{ client: string; server: string }>) {
  const t = useT();
  return (
    <Box fill center gap={16} px={32} py={64} accessibilityRole="alert">
      <Icon name="alert-triangle" size={40} color="textDim" />
      <Text variant="title" textAlign="center">
        {t('compat.clientOutdatedTitle')}
      </Text>
      <Text variant="body" color="textDim" textAlign="center">
        {t('compat.clientOutdated', { client, server })}
      </Text>
      <Text variant="body" color="textDim" textAlign="center">
        {t('compat.howToUpdateWeb')}
      </Text>
      <Button
        icon="refresh"
        label={t('compat.reload')}
        onPress={() => globalThis.location.reload()}
      />
    </Box>
  );
}
