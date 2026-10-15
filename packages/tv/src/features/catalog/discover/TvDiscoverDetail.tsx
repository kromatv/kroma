import { hasPermission } from '@kromatv/client/accounts';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { formatRuntime, watchableTitle } from '@kromatv/core';
import { useAskForTitle } from '@kromatv/core/react';
import { useT } from '@kromatv/ui';
import { Button, FocusRegion, FocusSlot, styles, Text, toast, useFocusNav } from '@kromatv/ui/kit';
import { useEffect } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useWatchable } from '#tv/app/providers/watchable';
import { useClient, useNav, useParams } from '#tv/app/router';
import { TvDetailScaffold } from '#tv/features/catalog/detail/DetailScaffold';
import { CastRow } from '#tv/features/catalog/detail/parts';
import { DiscoverSeasons } from '#tv/features/catalog/discover/DiscoverSeasons';
import { useDiscoverDetail } from '#tv/features/catalog/discover/useDiscoverDetail';

const STAGE_W = 1920;
const POSTER_W = 1280;

function AskButton({ entry }: Readonly<{ entry: DiscoverEntry }>) {
  const t = useT();
  const client = useClient();
  const { status, asking, failed, ask } = useAskForTitle(client, entry);

  useEffect(() => {
    if (failed) toast({ message: t('discover.requestFailed') });
  }, [failed, t]);

  return (
    <Button
      variant="outline"
      size="lg"
      icon="download"
      loading={asking}
      disabled={status !== null}
      label={status ? t('requests.newRequestExisting') : t('discover.request')}
      onPress={ask}
    />
  );
}

export function TvDiscoverDetail() {
  const { entry } = useParams('discover');
  const t = useT();
  const nav = useNav();
  const client = useClient();
  const { user } = useAuth();
  const { offered } = useWatchable();
  const fiche = useDiscoverDetail(entry.kind, entry.tmdbId);
  useFocusNav({ onBack: nav.back });

  const detail = fiche.state === 'read' ? fiche.detail : null;
  const film = entry.kind === 'movie' ? watchableTitle(entry) : null;
  const poster = client.media.artwork.resolve(entry.posterUrl, POSTER_W);
  const span = detail?.seasons.length
    ? t('content.seasonCount', { count: detail.seasons.length })
    : formatRuntime((detail?.runtimeMin ?? 0) * 60_000);
  const meta = [entry.year ? String(entry.year) : null, span, detail?.genres[0]]
    .filter(Boolean)
    .join(' · ');

  return (
    <TvDetailScaffold
      id={String(entry.tmdbId)}
      kind={`${t(entry.kind === 'show' ? 'discover.kindShow' : 'discover.kindMovie')} · ${t('discover.notInLibrary')}`}
      title={entry.title}
      backdrop={client.media.artwork.resolve(entry.backdropUrl ?? entry.posterUrl, STAGE_W)}
      rating={entry.rating}
      meta={meta}
      badge={null}
      overview={detail?.overview ?? entry.overview}
      actions={
        <FocusRegion style={s.actionRow}>
          {offered && film ? (
            <Button
              size="lg"
              autoFocus
              icon="player-play-filled"
              label={t('requests.watchNow')}
              onPress={() => nav.go('watch', { subject: { kind: 'title', title: film }, poster })}
            />
          ) : null}
          {user && hasPermission(user, 'requests.create') ? <AskButton entry={entry} /> : null}
        </FocusRegion>
      }
    >
      {offered === false ? (
        <Text variant="bodyTv" color="text/55" mt={20} maxW={680}>
          {t('requests.watchUnsupported')}
        </Text>
      ) : null}
      {fiche.state === 'refused' ? (
        <Text variant="bodyTv" color="textMuted" mt={20}>
          {t('requests.ledgerFailed')}
        </Text>
      ) : null}

      <FocusSlot>
        {entry.kind === 'show' && detail ? (
          <DiscoverSeasons entry={entry} seasons={detail.seasons} playable={offered ?? false} />
        ) : null}
      </FocusSlot>
      <FocusSlot>
        <CastRow cast={detail?.cast} crew={detail?.crew} />
      </FocusSlot>
    </TvDetailScaffold>
  );
}

const s = styles({
  actionRow: { row: true, align: 'center', gap: 16 },
});
