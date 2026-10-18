import type { MonitoredSummary } from '@kromatv/client/monitoring';
import type { RequestLedgerView } from '@kromatv/client/requests';
import { sizedImageUrl } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, confirm, Row, Surface, styles, Text, useBreakpoint } from '@kromatv/ui/kit';
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
  art: { fill: true, opacity: 0.42 },
  sideFade: {
    backgroundImage: [
      `linear-gradient(90deg, ${SURFACE} 0%,`,
      `color-mix(in srgb, ${SURFACE} 96%, transparent) 42%,`,
      `color-mix(in srgb, ${SURFACE} 80%, transparent) 70%,`,
      `color-mix(in srgb, ${SURFACE} 62%, transparent) 100%)`,
    ].join(' '),
  },
  bottomFade: {
    backgroundImage: `linear-gradient(0deg, ${SURFACE} 0%, color-mix(in srgb, ${SURFACE} 55%, transparent) 78%)`,
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
  const narrow = useBreakpoint() === 'base';
  const actions = (
    <HeroActions
      ledger={ledger}
      missing={monitored?.missing ?? null}
      busy={busy}
      stretch={narrow}
      onFollow={onFollow}
      onSearch={onSearch}
      onUnfollow={onUnfollow}
    />
  );
  return (
    <Surface tone="raised" radius="xl" pad="none" overflow="hidden">
      <Backdrop url={ledger.backdropUrl} />
      <Box px={PAD_X} py={PAD_Y} gap={16}>
        <Row gap={{ base: 16, md: 24 }} align="flex-start" wrap={false}>
          <Box w={POSTER_W} aspect={2 / 3} shrink={0} radius="md" overflow="hidden">
            <Box fill style={posterScrim(ledger.title)} />
            <Image src={sizedImageUrl(ledger.posterUrl, 264)} fit="cover" fill />
          </Box>

          <Box flex minW={0} gap={10}>
            <Pill ink={km.color} bg={km.bg} variant="overline">
              {t(`pipeline.type.${km.typeKey}` as MessageKey)}
            </Pill>
            <Text variant="h1" lines={2} accessibilityRole="header">
              {ledger.title}
            </Text>
            <MetaLine ledger={ledger} monitored={monitored} />
            {ledger.overview ? (
              <Text variant="meta" color="textDim" lines={3} maxW={620} mt={2}>
                {ledger.overview}
              </Text>
            ) : null}
            {narrow ? null : actions}
          </Box>
        </Row>
        {narrow ? actions : null}
      </Box>
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
  missing,
  busy,
  stretch,
  onFollow,
  onSearch,
  onUnfollow,
}: Readonly<{
  ledger: RequestLedgerView;
  missing: number | null;
  busy: boolean;
  stretch: boolean;
  onFollow: () => void;
  onSearch: () => void;
  onUnfollow: () => void;
}>) {
  const t = useT();
  const followed = missing !== null;
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
    <Row wrap gap={10} align="center">
      <Box w={stretch ? '100%' : undefined}>
        <Button
          size="sm"
          icon={followed ? 'eye' : 'eye-off'}
          variant={followed ? 'glass' : 'primary'}
          active={followed}
          pressed={followed}
          block={stretch}
          label={t(followed ? 'monitoring.followedState' : 'monitoring.follow')}
          onPress={() => (followed ? void stop() : onFollow())}
          loading={busy}
        />
      </Box>
      {missing !== null && missing > 0 ? (
        <Box w={stretch ? '100%' : undefined}>
          <Button
            size="sm"
            icon="search"
            block={stretch}
            label={t('monitoring.searchMissingCount', { count: missing })}
            onPress={onSearch}
            loading={busy}
          />
        </Box>
      ) : null}
      <ModuleSlot
        name="monitoring.search"
        kind={ledger.kind}
        tmdbId={ledger.tmdbId}
        title={ledger.title}
        season={null}
        episode={null}
        compact={false}
      />
      {ledger.localId ? (
        <Box flex={stretch}>
          <Button
            variant="glass"
            size="sm"
            icon="external-link"
            block={stretch}
            label={t('monitoring.openInLibrary')}
            asChild
          >
            {ledger.kind === 'show' ? (
              <RouteLink to="/shows/$id" params={{ id: ledger.localId }} />
            ) : (
              <RouteLink to="/movies/$id" params={{ id: ledger.localId }} />
            )}
          </Button>
        </Box>
      ) : null}
    </Row>
  );
}
