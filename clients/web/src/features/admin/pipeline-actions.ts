import { type ElementRow, type KromaClient, KromaEvents, type MessageKey } from '@kroma/core';
import type { useT } from '@kroma/ui';
import { type Dispatch, type SetStateAction, useEffect } from 'react';
import { apiBase } from '#web/shared/lib/api';

const apiKind = (el: ElementRow): 'item' | 'show' => (el.kind === 'series' ? 'show' : 'item');

const RELOAD_EVENTS = new Set([
  'pipeline.stats',
  'job.finished',
  'job.started',
  'item.updated',
  'show.updated',
  'library.updated',
]);

export function usePipelineReloadEvents(onReload: () => void): void {
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (RELOAD_EVENTS.has(e.type)) onReload();
      },
    });
    ev.connect();
    return () => ev.close();
  }, [onReload]);
}

export function pipelineActions(deps: {
  client: KromaClient;
  canManage: boolean;
  t: ReturnType<typeof useT>;
  reload: () => void;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  flash: (text: string) => void;
}) {
  const { client, canManage, t, reload, paused, setPaused, setBusy, flash } = deps;
  const togglePause = () => {
    if (!canManage) return;
    const next = !paused;
    setPaused(next); // optimistic
    client
      .pausePipeline(next)
      .then((r) => {
        setPaused(r.paused);
        flash(t(next ? 'pipeline.toastPaused' : 'pipeline.toastResumed'));
      })
      .catch(() => setPaused(!next));
  };
  const reprocess = (el: ElementRow) => {
    if (!canManage) return;
    setBusy(true);
    client
      .reprocessSubject(apiKind(el), el.id)
      .then(() => {
        flash(`« ${el.title} » ${t('pipeline.toastReprocess')}`);
        reload();
      })
      .finally(() => setBusy(false));
  };
  const retryStage = (el: ElementRow, stage: string) => {
    if (!canManage) return;
    setBusy(true);
    client
      .retryElementStage(apiKind(el), el.id, stage)
      .then(() => {
        const stageName = t(`pipeline.t.${stage}` as MessageKey);
        flash(`${stageName} ${t('pipeline.toastRetry')}`);
        reload();
      })
      .finally(() => setBusy(false));
  };
  return { togglePause, reprocess, retryStage };
}
