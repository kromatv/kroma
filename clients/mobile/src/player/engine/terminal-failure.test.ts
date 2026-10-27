// @vitest-environment jsdom

import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as failures from '../playback-failure';
import { cleanupEngineFixture, open, player, resetEngineFixture } from './engine.fixture';

beforeEach(resetEngineFixture);
afterEach(() => {
  cleanupEngineFixture();
  vi.restoreAllMocks();
});

describe('terminal stream failure diagnosis', () => {
  it('retains the native error immediately and then reports the server reason', async () => {
    let diagnosed: ((failure: failures.PlaybackFailure) => void) | undefined;
    vi.spyOn(failures, 'diagnosePlaybackFailure').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          diagnosed = resolve;
        }),
    );
    player().replaceAsync.mockRejectedValueOnce(new Error('Unsupported decoder'));
    const { result } = open();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.failure?.kind).toBe('unsupported');
    await act(async () => diagnosed?.({ kind: 'missing', detail: 'Media file no longer exists' }));
    expect(result.current.failure?.kind).toBe('missing');
  });

  it('cannot overwrite an engine after its owner has shut it down', async () => {
    let diagnosed: ((failure: failures.PlaybackFailure) => void) | undefined;
    vi.spyOn(failures, 'diagnosePlaybackFailure').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          diagnosed = resolve;
        }),
    );
    player().replaceAsync.mockRejectedValueOnce(new Error('Unsupported decoder'));
    const { result } = open();
    await waitFor(() => expect(result.current.failed).toBe(true));
    act(() => result.current.shutdown());
    await act(async () => diagnosed?.({ kind: 'missing' }));
    expect(result.current.failure?.kind).toBe('unsupported');
    expect(player().muted).toBe(true);
  });

  it('keeps the native reason if server diagnosis rejects', async () => {
    vi.spyOn(failures, 'diagnosePlaybackFailure').mockRejectedValueOnce(new Error('Disconnected'));
    player().replaceAsync.mockRejectedValueOnce(new Error('Unsupported decoder'));
    const { result } = open();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.failure?.kind).toBe('unsupported');
  });
});
