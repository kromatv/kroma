import { useT } from '@kromatv/ui';
import { Box, Button, Callout } from '@kromatv/ui/kit';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

const UPDATES_POLL_MS = 10 * 60_000;

export function UpdateCallout() {
  const t = useT();
  const { client } = useAuth();
  const { data } = usePoll(['admin', 'updates'], () => client.admin.updates(), UPDATES_POLL_MS);
  const latest = data?.latest;
  if (!data?.available || !latest) return null;
  const title =
    latest.version === data.version && latest.build
      ? t('admin.updateAvailableBuild', { version: latest.version, build: String(latest.build) })
      : t('admin.updateAvailable', { version: latest.version });

  return (
    <Box mt={24}>
      <Callout.Root tone="accent" icon="download">
        <Callout.Title>{title}</Callout.Title>
        <Callout.Detail>{t('admin.updateAvailableDetail')}</Callout.Detail>
        <Callout.Actions>
          <Button variant="glass" size="sm" label={t('admin.updateBackup')} asChild>
            <RouteLink to="/admin/backup" />
          </Button>
          <Button variant="primary" size="sm" label={t('admin.updatesOpen')} asChild>
            <RouteLink to="/admin/updates" />
          </Button>
        </Callout.Actions>
      </Callout.Root>
    </Box>
  );
}
