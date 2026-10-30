import { useT } from '@kromatv/ui';
import { Badge } from '@kromatv/ui/kit';
import { IconSparkles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

import { SideNav } from '#web/shared/ui/side-nav';

export function WhatsNewLink() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data } = useQuery({
    ...webRuntime.queries.userQueries.releases(),
    refetchOnWindowFocus: true,
  });
  if (!data?.unseen) return null;
  return (
    <SideNav.Item to="/whats-new" icon={IconSparkles}>
      <SideNav.Label>{t('releases.title')}</SideNav.Label>
      <SideNav.Trailing>
        <Badge tone="warning">{data.current}</Badge>
      </SideNav.Trailing>
    </SideNav.Item>
  );
}
