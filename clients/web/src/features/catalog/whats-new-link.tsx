import { useT } from '@kromatv/ui';
import { Badge } from '@kromatv/ui/kit';
import { IconSparkles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { userQueries } from '#web/shared/lib/queries';
import { SideNav } from '#web/shared/ui/side-nav';

export function WhatsNewLink() {
  const t = useT();
  const { data } = useQuery(userQueries.releases());
  return (
    <SideNav.Item to="/whats-new" icon={IconSparkles}>
      <SideNav.Label>{t('releases.title')}</SideNav.Label>
      {data?.unseen ? (
        <SideNav.Trailing>
          <Badge tone="warning">{data.current}</Badge>
        </SideNav.Trailing>
      ) : null}
    </SideNav.Item>
  );
}
