// @vitest-environment jsdom

import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT,
  ITEM,
  P,
  cleanupEngineFixture,
  open,
  playFor,
  player,
  reachReady,
  renderHook,
  resetEngineFixture,
  useFixtureEngine as useKromaEngine,
} from './engine.fixture';

beforeEach(resetEngineFixture);
afterEach(cleanupEngineFixture);

describe('useKromaEngine', () => {
  it('starts the film on its first open', async () => {
    open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));

    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(1);
  });

  it('resumes a reload the viewer had left running', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(60);

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(2);
  });

  it('leaves a reload alone under a viewer who had paused', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(60);
    player().playing = false;

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(1);
  });

  it('clears a stale loading status when the playback clock advances', async () => {
    const { result } = open();
    await reachReady();
    await playFor(60);
    act(() => player().emit('statusChange', { status: 'loading' }));
    expect(result.current.waiting).toBe(true);
    await playFor(60.5);
    expect(result.current.waiting).toBe(false);
  });

  it('does not mistake a seek for continuous playback', async () => {
    const { result } = open();
    await reachReady();
    act(() => player().emit('statusChange', { status: 'loading' }));
    await playFor(600);
    expect(result.current.waiting).toBe(true);
  });

  it('stops background audio when a local file fails', async () => {
    const { result } = renderHook(() => useKromaEngine(CLIENT, ITEM, 0, 'file:///broken.mp4'));
    await reachReady();
    act(() => player().emit('statusChange', { status: 'error' }));
    expect(result.current.failed).toBe(true);
    expect(player().pause).toHaveBeenCalled();
  });

  it('tracks an offline selection by native id when both labels are identical', async () => {
    const first = { id: '0', language: 'fr', label: 'French' };
    const second = { id: '1', language: 'fr', label: 'French' };
    player().availableAudioTracks = [first, second];
    const { result } = renderHook(() => useKromaEngine(CLIENT, ITEM, 0, 'file:///film.mp4'));
    await reachReady();
    act(() => result.current.setAudio(1));
    expect(player().audioTrack).toEqual(second);
    act(() => player().emit('audioTrackChange', { audioTrack: second }));
    expect(result.current.audioIndex).toBe(1);
  });

  it('ignores an old anchor response after a newer track has replaced it', async () => {
    const { result } = open();
    await reachReady();
    await playFor(60);
    const pending: ((value: unknown) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => pending.push(resolve))),
    );
    act(() => result.current.setAudio(1));
    act(() => result.current.setAudio(2));
    await act(async () => pending[1]?.({ headers: { get: () => '40' } }));
    await reachReady();
    await act(async () => pending[0]?.({ headers: { get: () => '50' } }));
    await playFor(1);
    expect(result.current.cur).toBe(41);
  });

  it('drops the old source depth rather than drawing it against the new anchor', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(600);
    expect(result.current.buffered).toBe(640);

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));

    expect(result.current.buffered).toBe(900);
  });
});
