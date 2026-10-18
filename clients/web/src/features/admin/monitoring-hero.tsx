import type { MonitoredSummary } from '@kromatv/client/monitoring';
import type { RequestLedgerView } from '@kromatv/client/requests';
import { sizedImageUrl } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, confirm, Row, Surface, styles, Text } from '@kromatv/ui/kit';
import { airStatusKey, showTotals } from '#web/features/admin/monitoring-model';
import { Pill } from '#web/features/admin/pill';
import { kindMeta } from '#web/features/admin/pipeline-meta';
import { posterScrim } from '#web/shared/lib/art-styles';
import { Image } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

const POSTER_W = { base: 88, md: 132 } as const;
const PAD_X = { base: 18, md: 28 } as const;
const PAD_Y = { base: 20, md: 26 } as const;

const SURFACE = 'var(--kroma-surface-2)';

const s = styles({
  art: { fill: true, opacity: 0.55 },
  sideFade: {
    backgroundImage: [
      `linear-gradient(90deg, ${SURFACE} 0%,`,
      `color-mix(in srgb, ${SURFACE} 92%, transparent) 40%,`,
      `color-mix(in srgb, ${SURFACE} 62%, transparent) 68%,`,
      `color-mix(in srgb, ${SURFACE} 42%, transparent) 100%)`,
    ].join(' '),
  },
  bottomFade: {
    backgroundImage: `linear-gradient(0deg, ${SURFACE} 0%, transparent 72%)`,
  },
});

export function MonitoringHero({
  ledger,
  monitored,
  busy,
  onFollow,
  onSearch,
  onUnfollow,
}: Readonly<{
  ledger: RequestLedgerView;
  monitored: MonitoredSummary | null;
  busy: boolean;
  onFollow: () => void;
  onSearch: () => void;
  onUnfollow: () => void;
}>) {
  const t = useT();
  const km = kindMeta(ledger.kind === 'show' ? 'series' : 'film');
  return (
    <Surface tone="raised" radius="xl" pad="none" overflow="hidden">
      <Backdrop url={ledger.backdropUrl} />
      <Row gap={{ base: 16, md: 24 }} align="flex-start" px={PAD_X} py={PAD_Y} wrap={false}>
        <Box w={POSTER_W} aspect={2 / 3} shrink={0} radius="md" overflow="hidden">
          <Box fill style={posterScrim(ledger.title)} />
          <Image src={sizedImageUrl(ledger.posterUrl, 264)} fit="cover" fill />
        </Box>

        <Box flex minW={0} gap={10}>
          <Pill ink={km.color} bg={km.bg} variant="overline">
            {t(`pipeline.type.${km.typeKey}` as MessageKey)}
          </Pill>
          <Text variant="h2" lines={2}>
            {ledger.title}
          </Text>
          <MetaLine ledger={ledger} monitored={monitored} />
          {ledger.overview ? (
            <Text variant="meta" color="textDim" lines={3} maxW={620} mt={2}>
              {ledger.overview}
            </Text>
          ) : null}
          <HeroActions
            ledger={ledger}
            monitored={monitored !== null}
            busy={busy}
            onFollow={onFollow}
            onSearch={onSearch}
            onUnfollow={onUnfollow}
          />
        </Box>
      </Row>
    </Surface>
  );
}

function MetaLine({
  ledger,
  monitored,
}: Readonly<{ ledger: RequestLedgerView; monitored: MonitoredSummary | null }>) {
  const t = useT();
  const totals = showTotals(ledger.seasons);
  const status = airStatusKey(monitored?.airStatus ?? null);
  const parts = [
    ledger.year ? String(ledger.year) : null,
    ledger.kind === 'show' ? t('content.seasonCount', { count: totals.seasons }) : null,
    ledger.kind === 'show' ? t('content.episodeCount', { count: totals.episodes }) : null,
    status ? t(status) : monitored?.airStatus,
    ledger.kind === 'movie' && monitored
      ? t(`monitoring.avail.${monitored.minAvailability}` as MessageKey)
      : null,
  ].filter(Boolean);
  return (
    <Text variant="meta" color="textDim">
      {parts.join(' · ')}
    </Text>
  );
}

function Backdrop({ url }: Readonly<{ url: string | null }>) {
  if (!url) return null;
  return (
    <>
      <Image src={sizedImageUrl(url, 1280)} fit="cover" style={s.art} />
      <Box fill style={s.sideFade} />
      <Box fill style={s.bottomFade} />
    </>
  );
}

function HeroActions({
  ledger,
  monitored,
  busy,
  onFollow,
  onSearch,
  onUnfollow,
}: Readonly<{
  ledger: RequestLedgerView;
  monitored: boolean;
  busy: boolean;
  onFollow: () => void;
  onSearch: () => void;
  onUnfollow: () => void;
}>) {
  const t = useT();
  const stop = async () => {
    const ok = await confirm({
      title: t('monitoring.unfollowConfirm', { title: ledger.title }),
      message: t('monitoring.unfollowConfirmHint'),
      confirmLabel: t('monitoring.unfollow'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) onUnfollow();
  };
  return (
    <Row wrap gap={10} mt={8}>
      {monitored ? (
        <Button
          size="sm"
          icon="search"
          label={t('monitoring.searchMissing')}
          onPress={onSearch}
          loading={busy}
        />
      ) : (
        <Button
          size="sm"
          icon="eye"
          label={t('monitoring.follow')}
          onPress={onFollow}
          loading={busy}
        />
      )}
      {ledger.localId ? (
        <Button
          variant="glass"
          size="sm"
          icon="external-link"
          label={t('monitoring.openInLibrary')}
          asChild
        >
          {ledger.kind === 'show' ? (
            <RouteLink to="/shows/$id" params={{ id: ledger.localId }} />
          ) : (
            <RouteLink to="/movies/$id" params={{ id: ledger.localId }} />
          )}
        </Button>
      ) : null}
      {monitored ? (
        <Button
          variant="dangerGhost"
          size="sm"
          icon="eye-off"
          label={t('monitoring.unfollow')}
          onPress={() => void stop()}
          disabled={busy}
        />
      ) : null}
    </Row>
  );
}
