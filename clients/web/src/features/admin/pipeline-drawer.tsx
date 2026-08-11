import type { ElementRow, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Callout, color, Divider, Drawer, IconButton, Row, Text } from '@kroma/ui/kit';
import { createCallable } from 'react-call';
import { Pill, PillDot } from '#web/features/admin/pill';
import { fmtDur, kindMeta, posterGrad, statusMeta } from '#web/features/admin/pipeline-meta';
import { SCROLL_PANE } from '#web/features/admin/web-style';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

function DrawerPoster({ el }: Readonly<{ el: ElementRow }>) {
  const { client } = useAuth();
  const src =
    (el.poster ? client.resolveArt(el.poster) : null) ??
    (el.kind === 'series' ? client.showPosterUrl(el.id) : client.posterUrl(el.id));
  return (
    <Box w={70} h={104} shrink={0} radius="xs" overflow="hidden" shadow="pop">
      <div style={{ position: 'absolute', inset: 0, background: posterGrad(el.title) }} />
      <Image src={src} fit="cover" fill />
    </Box>
  );
}

function baseSub(el: ElementRow, dur: string, seasons: string): string {
  if (el.kind === 'series') {
    return [el.genre, el.seasonCount ? `${el.seasonCount} ${seasons}` : '']
      .filter(Boolean)
      .join(' · ');
  }
  if (el.kind === 'episode') return dur;
  return [el.year ? String(el.year) : '', el.genre, dur].filter(Boolean).join(' · ');
}

export const PipelineDrawer = createCallable<
  Readonly<{
    el: ElementRow;
    busy: boolean;
    onReprocess: () => void;
    onRetryStage: (stage: string) => void;
  }>,
  void
>(({ call, el, busy, onReprocess, onRetryStage }) => {
  const t = useT();
  // react-call keeps us mounted for `unmountingDelay` ms after `call.end()`,
  // which is the window the kit Drawer's slide-out plays in.
  const close = () => call.end();
  const km = kindMeta(el.kind);
  const dur = fmtDur(el.durationMs);
  const eps = el.epStats;

  return (
    <Drawer
      open={!call.ended}
      onClose={close}
      title={t('pipeline.elementSheet')}
      width={460}
      panelStyle={DRAWER_FILL}
    >
      <Box px={24} py={20}>
        <Row between mb={16}>
          <Text variant="overline" color="textDim">
            {t('pipeline.elementSheet')}
          </Text>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={close} />
        </Row>
        <Box row gap={16}>
          <DrawerPoster el={el} />
          <Box minW={0} pt={4} align="flex-start">
            <Pill ink={km.color} bg={km.bg} variant="overline">
              {t(`pipeline.type.${km.typeKey}` as MessageKey)}
            </Pill>
            <Text variant="h2" accessibilityRole="header" mt={10}>
              {el.title}
            </Text>
            <Text variant="meta" color="textDim" mt={6}>
              {baseSub(el, dur, t('pipeline.seasons'))}
            </Text>
          </Box>
        </Box>
      </Box>
      <Divider color="tint/7" />

      <div style={SCROLL_PANE}>
        <Box px={24} py={20}>
          <Text variant="overline" color="textDim" mb={12}>
            {t('pipeline.treatments')}
          </Text>
          <Box gap={10}>
            {el.treatments.map((tr) => {
              const m = statusMeta(tr.status);
              const failed = tr.status === 'failed';
              return (
                <Box key={tr.key} px={16} py={14} radius="lg" bg="surface1" border="tint/7">
                  <Row between gap={12}>
                    <Text variant="label">{t(`pipeline.t.${tr.key}` as MessageKey)}</Text>
                    <Row gap={8}>
                      <Pill
                        ink={m.color}
                        bg={m.bg}
                        leading={<PillDot tone={m.dot} pulse={m.pulse} />}
                      >
                        {t(`pipeline.st.${tr.status}` as MessageKey)}
                      </Pill>
                      {/* Run just this stage now, at top priority (also acts as a retry on failure). */}
                      <IconButton
                        control="sm"
                        icon="refresh"
                        active={failed}
                        label={failed ? t('pipeline.retryStage') : t('pipeline.runStage')}
                        onPress={() => onRetryStage(tr.key)}
                        disabled={busy}
                      />
                    </Row>
                  </Row>
                  {failed && tr.error ? (
                    <Box mt={10}>
                      <Callout.Root tone="danger" title={tr.error} />
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Box>

          {el.kind === 'series' && eps ? (
            <Box mt={20} px={16} py={14} radius="lg" bg="bg" border="tint/7">
              <Text variant="overline" color="textDim" mb={8}>
                {t('pipeline.epsAggregated')}
              </Text>
              <Text variant="meta" color="textMuted">
                {eps.episodes} {t('pipeline.episodesWord')} · {t('pipeline.t.probe')} {eps.probed}/
                {eps.episodes} · {t('pipeline.t.storyboard')} {eps.storyboarded}/{eps.episodes} ·{' '}
                {t('pipeline.t.markers')} {eps.markerSeasons}/{eps.seasons}
              </Text>
              <Text variant="meta" color="textDim" mt={6}>
                {t('pipeline.epsNote')}
              </Text>
            </Box>
          ) : null}
        </Box>
      </div>

      <Divider color="tint/7" />
      <Box px={24} py={18}>
        <Button
          block
          icon="refresh"
          label={t('pipeline.reprocessElement')}
          onPress={onReprocess}
          loading={busy}
        />
        <Text variant="meta" color="textDim" textAlign="center" mt={10}>
          {t('pipeline.reprocessNote')}
        </Text>
      </Box>
    </Drawer>
  );
}, 400);

// The drawers' darker fill, kept from the hand-rolled asides they replace.
const DRAWER_FILL = { backgroundColor: color('bg') } as const;
