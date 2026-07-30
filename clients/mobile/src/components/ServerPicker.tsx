// The sign-in "pick a server" phase: saved servers, the live-scanned local
// section and the manual add row. Presentation only; selection, connection
// and the discovery loop stay in the sign-in screen.

import { Icon } from '@kroma/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';
import { BackLink, OnboardingBox, OnboardingTitle } from './OnboardingScreen';
import { ServerList, ServerRow, ServerSectionHeader, ServerSectionHint } from './serverRows';
import { ErrorBanner } from './ui';

export type SavedServerRow = { url: string; name: string; host: string; offline: boolean };
export type FoundServerRow = { url: string; name: string | null; host: string };

export function ServerPicker({
  saved,
  discovered,
  busy,
  error,
  onPickSaved,
  onPickDiscovered,
  onAddServer,
  onBack,
}: Readonly<{
  saved: SavedServerRow[];
  discovered: FoundServerRow[];
  busy: boolean;
  error: string | null;
  onPickSaved(url: string): void;
  onPickDiscovered(url: string): void;
  onAddServer(): void;
  onBack(): void;
}>) {
  const t = useT();
  return (
    <OnboardingBox>
      <OnboardingTitle title={t('auth.addProfile')} subtitle={t('nav.server')} />
      <ServerList>
        {saved.map((server) => {
          let host: string | null = null;
          if (server.offline) host = t('profiles.serverOffline');
          else if (server.name !== server.host) host = server.host;
          return (
            <ServerRow
              key={server.url}
              name={server.name}
              host={host}
              disabled={server.offline}
              dimmed={server.offline}
              onPress={() => onPickSaved(server.url)}
            />
          );
        })}
        <ServerRow
          name={t('connect.addServerTitle')}
          icon={<Icon name="plus" size={17} stroke={2.2} color={colors.accent} />}
          onPress={onAddServer}
        />
      </ServerList>
      <ServerSectionHeader title={t('connect.localServers')} loading />
      {discovered.length > 0 ? (
        <ServerList>
          {discovered.map((server) => (
            <ServerRow
              key={`found-${server.url}`}
              name={server.name ?? server.host}
              host={server.name ? server.host : null}
              disabled={busy}
              onPress={() => onPickDiscovered(server.url)}
            />
          ))}
        </ServerList>
      ) : (
        <ServerSectionHint>{t('connect.searchingServer')}</ServerSectionHint>
      )}
      <ErrorBanner message={error} />
      <BackLink onPress={onBack} />
    </OnboardingBox>
  );
}
