import type { ElementRow, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, color, Drawer, IconButton } from '@kroma/ui/kit';
import { createCallable } from 'react-call';
import { fmtDur, kindMeta, posterGrad, statusMeta } from '#web/features/admin/pipeline-meta';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

function DrawerPoster({ el }: Readonly<{ el: ElementRow }>) {
  const { client } = useAuth();
  const src =
    (el.poster ? client.resolveArt(el.poster) : null) ??
    (el.kind === 'series' ? client.showPosterUrl(el.id) : client.posterUrl(el.id));
  return (
    <div
      className="relative h-[104px] w-[70px] flex-[0_0_70px] overflow-hidden rounded-md shadow-[0_10px_24px_rgba(0,0,0,.5)]"
      style={{ background: posterGrad(el.title) }}
    >
      <Image src={src} fit="cover" fill />
    </div>
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
      <div className="border-b border-white/[0.07] px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
            {t('pipeline.elementSheet')}
          </span>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={close} />
        </div>
        <div className="flex gap-4">
          <DrawerPoster el={el} />
          <div className="min-w-0 pt-1">
            <span
              className="rounded-full px-[9px] py-[3px] text-[9.5px] font-bold uppercase tracking-widest"
              style={{ color: km.color, background: km.bg }}
            >
              {t(`pipeline.type.${km.typeKey}` as MessageKey)}
            </span>
            <h2 className="mt-2.5 font-display text-[21px] font-bold leading-[1.12]">{el.title}</h2>
            <div className="mt-1.5 text-[12.5px] font-medium text-white/50">
              {baseSub(el, dur, t('pipeline.seasons'))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
          {t('pipeline.treatments')}
        </div>
        <div className="flex flex-col gap-2.5">
          {el.treatments.map((tr) => {
            const m = statusMeta(tr.status);
            const failed = tr.status === 'failed';
            return (
              <div
                key={tr.key}
                className="rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-bold">
                    {t(`pipeline.t.${tr.key}` as MessageKey)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[11.5px] font-bold"
                      style={{ color: m.color, background: m.bg }}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${m.pulse ? 'animate-pulse' : ''}`}
                        style={{ background: m.dot }}
                      />
                      {t(`pipeline.st.${tr.status}` as MessageKey)}
                    </span>
                    {/* Run just this stage now, at top priority (also acts as a retry on failure). */}
                    <IconButton
                      control="sm"
                      icon="refresh"
                      active={failed}
                      label={failed ? t('pipeline.retryStage') : t('pipeline.runStage')}
                      onPress={() => onRetryStage(tr.key)}
                      disabled={busy}
                    />
                  </div>
                </div>
                {failed && tr.error ? (
                  <div className="mt-2.5 rounded-lg border border-danger/18 bg-danger/8 px-[11px] py-2.5 text-[12px] leading-[1.4] text-danger-hover">
                    {tr.error}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {el.kind === 'series' && eps ? (
          <div className="mt-5 rounded-xl border border-white/[0.07] bg-bg px-4 py-3.5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/40">
              {t('pipeline.epsAggregated')}
            </div>
            <div className="text-[12.5px] font-semibold leading-normal text-white/70">
              {eps.episodes} {t('pipeline.episodesWord')} · {t('pipeline.t.probe')} {eps.probed}/
              {eps.episodes} · {t('pipeline.t.storyboard')} {eps.storyboarded}/{eps.episodes} ·{' '}
              {t('pipeline.t.markers')} {eps.markerSeasons}/{eps.seasons}
            </div>
            <div className="mt-1.5 text-[11.5px] font-medium text-white/42">
              {t('pipeline.epsNote')}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/[0.07] px-6 py-4.5">
        <Button
          block
          icon="refresh"
          label={t('pipeline.reprocessElement')}
          onPress={onReprocess}
          loading={busy}
        />
        <div className="mt-2.5 text-center text-[11.5px] font-medium text-white/42">
          {t('pipeline.reprocessNote')}
        </div>
      </div>
    </Drawer>
  );
}, 400);

// The drawers' darker fill, kept from the hand-rolled asides they replace.
const DRAWER_FILL = { backgroundColor: color('bg') } as const;
