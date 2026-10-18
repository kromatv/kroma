import { useT } from '@kromatv/ui';
import { Button, Callout } from '@kromatv/ui/kit';
import { useMonitoredTitles } from '#web/features/admin/use-monitoring';
import { RouteLink } from '#web/shared/ui/route-link';

export function MissingCallout() {
  const t = useT();
  const { data: titles } = useMonitoredTitles();
  if (!titles) return null;

  const missing = titles.reduce((total, title) => total + title.missing, 0);
  if (missing === 0) return null;
  const titleCount = titles.filter((title) => title.missing > 0).length;

  return (
    <Callout.Root tone="accent" icon="alert-triangle">
      <Callout.Title>{t('requests.missingCount', { count: missing })}</Callout.Title>
      <Callout.Detail>{t('monitoring.acrossTitles', { count: titleCount })}</Callout.Detail>
      <Callout.Actions>
        <Button variant="glass" size="sm" label={t('requests.missingSee')} asChild>
          <RouteLink to="/admin/monitoring" search={{ view: 'missing' }} />
        </Button>
      </Callout.Actions>
    </Callout.Root>
  );
}
