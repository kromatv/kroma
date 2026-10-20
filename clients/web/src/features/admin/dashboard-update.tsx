import { useT } from '@kromatv/ui';
import { Button, Callout } from '@kromatv/ui/kit';
import { Linking } from 'react-native';
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

  return (
    <Callout.Root tone="accent" icon="download">
      <Callout.Title>{t('admin.updateAvailable', { version: latest.version })}</Callout.Title>
      <Callout.Detail>{t('admin.updateAvailableDetail')}</Callout.Detail>
      <Callout.Actions>
        <Button variant="glass" size="sm" label={t('admin.updateBackup')} asChild>
          <RouteLink to="/admin/backup" />
        </Button>
        <Button
          variant="glass"
          size="sm"
          label={t('admin.updateNotes')}
          onPress={() => Linking.openURL(latest.url)}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}
