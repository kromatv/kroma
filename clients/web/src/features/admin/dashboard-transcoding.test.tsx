// @vitest-environment jsdom

import { ItemId } from '@kromatv/client/media';
import type { LiveTranscode, Transcodes } from '@kromatv/client/admin';
import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TranscodingSection } from '#web/features/admin/dashboard-transcoding';

afterEach(cleanup);

const LONG_TITLE =
  'The Extraordinarily Long Theatrical Title That Never Fits On One Dashboard Line';

const session = (fields: Partial<LiveTranscode> = {}): LiveTranscode => ({
  id: 'tc-1',
  itemId: ItemId.parse('it-1'),
  audioTrack: 0,
  video: 'h264-1080',
  audio: 'aac',
  transcodesVideo: true,
  transcodesAudio: true,
  accel: 'videotoolbox',
  effort: 'realtime',
  onTheCpu: false,
  anchorSecs: 450,
  startSecs: 442,
  startedAt: 0,
  speed: 1.8,
  fps: 48,
  frames: 1200,
  dropped: 0,
  outTimeMs: 456_000,
  segments: 2,
  bytes: 4_000_000,
  running: true,
  title: LONG_TITLE,
  cpu: 12,
  ...fields,
});

function stage(...sessions: LiveTranscode[]) {
  const data: Transcodes = {
    hardware: { accel: 'videotoolbox', reason: 'Apple silicon', accelerated: true },
    sessions,
    encoding: sessions.length,
    cacheBytes: 0,
  };
  render(
    <I18nProvider locale="en">
      <TranscodingSection data={data} />
    </I18nProvider>,
  );
}

describe('a transcode session card', () => {
  it('keeps the whole title on hover when the line is cut short', () => {
    stage(session());

    expect(screen.getByTitle(LONG_TITLE).textContent).toBe(LONG_TITLE);
  });

  it('reads the stretch of film produced from the keyframe ffmpeg started on', () => {
    stage(session());

    expect(screen.getByText('7:22 to 7:36')).toBeTruthy();
  });

  it('starts the stretch at the seek point when the server does not say where ffmpeg started', () => {
    stage(session({ startSecs: null }));

    expect(screen.getByText('7:30 to 7:36')).toBeTruthy();
  });

  it('shows a dash until ffmpeg has reported a position', () => {
    stage(session({ outTimeMs: 0 }));

    expect(screen.getByText('-')).toBeTruthy();
  });

  it('shows a dash while the clock is still behind where ffmpeg started', () => {
    stage(session({ outTimeMs: 441_000 }));

    expect(screen.getByText('-')).toBeTruthy();
  });
});
