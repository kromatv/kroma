import type { PlaybackSession } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, Section } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { useAccountRoster } from '#web/features/admin/dashboard-accounts';
import { BandwidthSection, CpuSection, RamSection } from '#web/features/admin/dashboard-metrics';
import { MostWatchedSection } from '#web/features/admin/dashboard-most-watched';
import { NowPlayingCard, StopStreamModal } from '#web/features/admin/dashboard-now-playing';
import { PlaybackSection } from '#web/features/admin/dashboard-playback';
import { TopViewersSection } from '#web/features/admin/dashboard-top-viewers';
import { TranscodingSection } from '#web/features/admin/dashboard-transcoding';
import { RealtimeBadge } from '#web/features/admin/realtime-badge';
import { PageHeader, useAdmin, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const SESSIONS_POLL_MS = 3000;
const TRANSCODES_POLL_MS = 3000;

export function DashboardScreen() {
  const t = useT();
  const { client } = useAuth();
  const { serverInfo } = useAdmin();

  const { data: sessionsData, reload: reloadSessions } = usePoll(
    ['admin', 'sessions'],
    () => client.admin.sessions(),
    SESSIONS_POLL_MS,
  );
  const { data: transcodes } = usePoll(
    ['admin', 'transcodes'],
    () => client.admin.transcodes(),
    TRANSCODES_POLL_MS,
  );
  const roster = useAccountRoster();

  const sessions = sessionsData?.sessions ?? [];
  const askStop = async (session: PlaybackSession) => {
    if (await StopStreamModal.call({ session })) reloadSessions();
  };
  const avatarByUser = useMemo(() => {
    const known = new Map<string, string | null>();
    for (const user of roster) known.set(user.id, user.avatarUrl ?? null);
    return known;
  }, [roster]);

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title suffix={t('admin.dashboardSuffix')}>
          {serverInfo?.name ?? 'KROMA'}
        </PageHeader.Title>
        <PageHeader.Actions>
          <RealtimeBadge />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.nowPlaying')}</Section.Title>
        </Section.Header>
        {sessions.length === 0 ? (
          <EmptyState.Root icon="player-play">
            <EmptyState.Title>{t('admin.noPlayback')}</EmptyState.Title>
          </EmptyState.Root>
        ) : (
          <Box gap={14}>
            {sessions.map((session) => (
              <NowPlayingCard
                key={session.id}
                s={session}
                avatarUrl={session.userId ? avatarByUser.get(session.userId) : null}
                onStop={() => void askStop(session)}
              />
            ))}
          </Box>
        )}
      </Section.Root>

      <TranscodingSection data={transcodes} />

      <BandwidthSection />
      <CpuSection />
      <RamSection />

      <TopViewersSection />
      <PlaybackSection />
      <MostWatchedSection />
    </>
  );
}
