import type { KromaClient } from '@kroma/client';
import type { ElementRow } from '@kroma/client/pipeline';
import { describe, expect, it, vi } from 'vitest';
import { pipelineActions } from './pipeline-actions';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const row = (kind: string, id: string): ElementRow => ({
  id,
  kind,
  title: 'Dune',
  poster: null,
  year: null,
  genre: null,
  durationMs: null,
  seasonCount: null,
  treatments: [],
  overall: 'done',
});

function harness(overrides: { canManage?: boolean; pipeline?: object } = {}) {
  const flash = vi.fn();
  const reload = vi.fn();
  const setPaused = vi.fn();
  const setBusy = vi.fn();
  const pipeline = {
    pause: vi.fn(async (paused: boolean) => ({ paused })),
    reprocessSubject: vi.fn(async () => undefined),
    retryElement: vi.fn(async () => undefined),
    ...overrides.pipeline,
  };
  const actions = pipelineActions({
    client: { pipeline } as unknown as KromaClient,
    canManage: overrides.canManage ?? true,
    t: ((key: string) => key) as never,
    reload,
    paused: false,
    setPaused,
    setBusy,
    flash,
  });
  return { actions, pipeline, flash, reload, setPaused, setBusy };
}

describe('pausing the pipeline', () => {
  it('holds every stage at once, taking the server’s answer as the truth', async () => {
    const { actions, pipeline, setPaused, flash } = harness();

    actions.togglePause();
    await flush();

    expect(pipeline.pause).toHaveBeenCalledWith(true);
    expect(setPaused.mock.calls).toEqual([[true], [true]]);
    expect(flash).toHaveBeenCalledWith('pipeline.toastPaused');
  });

  it('puts the switch back when the call fails', async () => {
    const pause = vi.fn(async () => {
      throw new Error('nope');
    });
    const { actions, setPaused, flash } = harness({ pipeline: { pause } });

    actions.togglePause();
    await flush();

    expect(setPaused.mock.calls).toEqual([[true], [false]]);
    expect(flash).not.toHaveBeenCalled();
  });
});

describe('acting on one element', () => {
  it('addresses a series as a show id and a film as an item id', async () => {
    const { actions, pipeline } = harness();

    actions.reprocess(row('series', 's1'));
    actions.retryStage(row('movie', 'i1'), 'probe');
    await flush();

    expect(pipeline.reprocessSubject).toHaveBeenCalledWith('show', 's1');
    expect(pipeline.retryElement).toHaveBeenCalledWith('item', 'i1', 'probe');
  });

  it('reloads the page and lifts the busy flag once the work is acknowledged', async () => {
    const { actions, reload, setBusy, flash } = harness();

    actions.reprocess(row('movie', 'i1'));
    await flush();

    expect(flash).toHaveBeenCalledWith('« Dune » pipeline.toastReprocess');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it('does nothing at all without the capability', async () => {
    const { actions, pipeline, setBusy } = harness({ canManage: false });

    actions.togglePause();
    actions.reprocess(row('movie', 'i1'));
    actions.retryStage(row('movie', 'i1'), 'probe');
    await flush();

    expect(pipeline.pause).not.toHaveBeenCalled();
    expect(pipeline.reprocessSubject).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
  });
});
