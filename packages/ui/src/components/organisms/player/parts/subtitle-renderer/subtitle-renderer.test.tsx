// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUB_APPEARANCE } from '#ui/components/organisms/player/lib/subtitle-appearance';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { SubtitleRenderer } from './subtitle-renderer.component';

const URL = 'https://media.test/sub.vtt';

const CUES = `WEBVTT

00:00:10.000 --> 00:00:11.000
ten

00:00:11.000 --> 00:00:12.000
eleven

00:00:12.000 --> 00:00:13.000
twelve

00:00:15.000 --> 00:00:16.000
fifteen

00:00:20.000 --> 00:00:21.000
twenty
`;

const TRACK: PlayerSub[] = [
  { index: 0, language: 'eng', label: 'English', codec: 'webvtt', url: URL, selectable: true },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(CUES, { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderer(props: { positionSec: number; playing: boolean }) {
  return (
    <SubtitleRenderer
      {...props}
      subtitles={TRACK}
      activeIndex={0}
      appearance={DEFAULT_SUB_APPEARANCE}
      clearance={0}
    />
  );
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mount(props: { positionSec: number; playing: boolean }) {
  const view = render(renderer(props));
  await elapse(0);
  screen.getByText('ten');
  return view;
}

describe('SubtitleRenderer', () => {
  it('runs on between two position reports', async () => {
    await mount({ positionSec: 10.2, playing: true });

    await elapse(900);

    expect(screen.getByText('eleven')).toBeTruthy();
  });

  it('runs no further than a second past a picture that stopped reporting', async () => {
    await mount({ positionSec: 10.2, playing: true });

    await elapse(5_000);

    expect(screen.getByText('eleven')).toBeTruthy();
    expect(screen.queryByText('fifteen')).toBeNull();
  });

  it('holds the line while the picture is not moving', async () => {
    const view = await mount({ positionSec: 10.2, playing: true });

    view.rerender(renderer({ positionSec: 10.4, playing: false }));
    await elapse(10_000);

    expect(screen.getByText('ten')).toBeTruthy();
  });

  it('starts again from where the picture stopped, not from when it stopped', async () => {
    const view = await mount({ positionSec: 10.2, playing: true });
    view.rerender(renderer({ positionSec: 10.4, playing: false }));
    await elapse(10_000);

    view.rerender(renderer({ positionSec: 10.4, playing: true }));
    await elapse(300);

    expect(screen.getByText('ten')).toBeTruthy();
  });
});
