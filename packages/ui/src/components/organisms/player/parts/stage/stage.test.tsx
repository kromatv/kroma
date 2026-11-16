// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { DEFAULT_SUB_APPEARANCE } from '../../lib/subtitle-appearance';
import { fakeController } from '../../player.fixture';
import type { PlayerController } from '../../types';
import { Stage } from './stage.component';

function stage(settingsShrink: boolean, controller: PlayerController = fakeController()) {
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  const { container } = render(
    <I18nProvider locale="en">
      <Stage
        controller={controller}
        stageSize={{ width: 1920, height: 1080 }}
        settingsShrink={settingsShrink}
        appearance={DEFAULT_SUB_APPEARANCE}
        clearance={0}
        locked={false}
        onPress={() => {}}
        onLongPress={() => {}}
      />
    </I18nProvider>,
  );
  return { timing, node: container.querySelector('#kroma-player-stage') as HTMLElement };
}

describe('the settings card on the web', () => {
  it('shrinks on a CSS transition, never on Animated', () => {
    // react-native-web has no native driver: an Animated shrink there is a JS
    // animation, one render per frame on the thread the chrome ticks on.
    const { node, timing } = stage(true);
    expect(node.style.transitionProperty).toBe('transform');
    expect(node.style.transform).toContain('scale(');
    expect(timing).not.toHaveBeenCalled();
  });

  it('asks for the layer up front, so the first frame is not the promotion', () => {
    expect(stage(true).node.style.willChange).toBe('transform');
  });

  it('sits at full size until the panel takes the stage', () => {
    expect(stage(false).node.style.transform).toBe('scale(1)');
  });
});

describe('a subtitle track that fails to load', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is reported to the controller, so the host can drop it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const markSubtitleFailed = vi.fn();
    const controller = fakeController({
      subtitles: [{ index: 3, language: 'fra', codec: 'subrip', url: '/3.vtt', selectable: true }],
      subtitleIndex: 3,
      markSubtitleFailed,
    });

    stage(false, controller);

    await waitFor(() => expect(markSubtitleFailed).toHaveBeenCalledWith(3));
  });
});

describe('a subtitle over a picture that is buffering', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays on the line the picture stopped on', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const cues =
      'WEBVTT\n\n00:00:10.000 --> 00:00:11.000\nten\n\n00:00:11.000 --> 00:00:12.000\neleven\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(cues, { status: 200 })),
    );
    const controller = fakeController({
      subtitles: [{ index: 0, language: 'eng', codec: 'webvtt', url: '/0.vtt', selectable: true }],
      subtitleIndex: 0,
      cur: 10.2,
      playing: true,
      waiting: true,
    });

    const { node } = stage(false, controller);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(node.textContent).toContain('ten');
    expect(node.textContent).not.toContain('eleven');
  });
});
