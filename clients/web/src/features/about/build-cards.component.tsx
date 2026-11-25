import type { BuildInfo } from 'virtual:build-info';
import { useLocale, useT } from '@kromatv/ui';
import { ListRow, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { appFacts, type Fact, serverFacts } from '#web/features/about/build-facts';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { SettingCard } from '#web/shared/ui/setting-card.component';

function Facts({ facts }: Readonly<{ facts: readonly Fact[] }>) {
  return (
    <ListRow.Group size="sm">
      {facts.map((fact) => (
        <ListRow.Root key={fact.label}>
          <ListRow.Label>{fact.label}</ListRow.Label>
          <ListRow.Trailing shrink>
            <Text
              variant="meta"
              color="textMuted"
              font={fact.mono ? 'mono' : undefined}
              lines={1}
              selectable
            >
              {fact.value}
            </Text>
          </ListRow.Trailing>
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

/** The server this client talks to: its name and the build it runs. */
export function ServerCard() {
  const t = useT();
  const { queries } = useWebRuntime();
  const { data: health } = useQuery(queries.serverQueries.health());
  return (
    <SettingCard icon="server" title={t('about.server')} description={health?.name}>
      {health ? <Facts facts={serverFacts(health, t)} /> : null}
    </SettingCard>
  );
}

/** The build of this web client. */
export function AppCard({ info }: Readonly<{ info: BuildInfo }>) {
  const t = useT();
  const locale = useLocale();
  return (
    <SettingCard icon="browser" title={t('about.app')} description={t('about.appWeb')}>
      <Facts facts={appFacts(info, t, locale)} />
    </SettingCard>
  );
}
