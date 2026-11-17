// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_MS, HIDDEN_RECHECKS, SAFETY_MS, SAFETY_SLACK_MS } from './constants';
import { KromaIntro, type KromaIntroProps } from './index';

const play = vi.fn<() => Promise<void> | undefined>();

function stubMedia(readyState: number, duration: number) {
  const proto = HTMLMediaElement.prototype;
  for (const [key, value] of [
    ['play', play],
    ['pause', () => undefined],
    ['currentTime', 0],
    ['duration', duration],
    ['readyState', readyState],
  ] as const) {
    Object.defineProperty(proto, key, { configurable: true, writable: true, value });
  }
}

async function mount(props: Partial<KromaIntroProps> = {}) {
  const onDone = vi.fn();
  const view = render(createElement(KromaIntro, { onDone, ...props }));
  await act(async () => undefined);
  const video = view.container.querySelector('video');
  if (!video) {
    throw new Error('no <video> rendered');
  }
  return { ...view, video, onDone, sources: [...video.querySelectorAll('source')] };
}

function press(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function fire(target: EventTarget | undefined, type: string) {
  act(() => {
    target?.dispatchEvent(new Event(type));
  });
}

function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMedia(HTMLMediaElement.HAVE_ENOUGH_DATA, 5);
  play.mockReset();
  play.mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('KromaIntro sources', () => {
  it('offers the HEVC film first and its H.264 encode second, each with its codecs', async () => {
    const { sources } = await mount();

    expect(sources.map((s) => s.type)).toEqual([
      'video/mp4; codecs="hvc1.1.6.L153.90, mp4a.40.2"',
      'video/mp4; codecs="avc1.640020, mp4a.40.2"',
    ]);
    expect(sources.map((s) => s.src)).toEqual([
      expect.stringMatching(/kroma-intro-hevc\.mp4$/),
      expect.stringMatching(/kroma-intro-h264\.mp4$/),
    ]);
  });

  it('plays a film handed in place of the bundled one as its only source', async () => {
    const { sources } = await mount({ videoSrc: '/brand.mp4' });

    expect(sources.map((s) => [s.getAttribute('src'), s.type])).toEqual([['/brand.mp4', '']]);
  });
});

describe('KromaIntro when nothing can play', () => {
  it('leaves the film to the next source when the engine cannot play the first', async () => {
    const { sources, onDone } = await mount();

    fire(sources[0], 'error');
    elapse(EXIT_MS);

    expect(onDone).not.toHaveBeenCalled();
  });

  it('hands off at once when the engine can play no source', async () => {
    const { sources, onDone } = await mount();

    fire(sources.at(-1), 'error');

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands off at once when the film fails to decode', async () => {
    const { video, onDone } = await mount();

    fire(video, 'error');

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands off at once when even muted playback is refused', async () => {
    play.mockReset();
    play.mockRejectedValue(new Error('NotAllowedError'));

    const { onDone } = await mount();

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands off at once when the film has no source at all', async () => {
    const { onDone } = await mount({ videoSrc: '' });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands off once when the film fails after a skip', async () => {
    const { video, onDone } = await mount();

    press('Enter');
    fire(video, 'error');
    elapse(EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('KromaIntro playing', () => {
  it('falls back to muted playback when sound-first autoplay is blocked', async () => {
    const { video } = await mount();

    expect(play).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
  });

  it('retries with sound once the film can play when its own loading interrupted play()', async () => {
    stubMedia(HTMLMediaElement.HAVE_NOTHING, 5);
    play.mockReset();
    play.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));
    play.mockResolvedValue(undefined);
    const { video } = await mount();

    fire(video, 'canplay');

    expect(play).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(false);
  });

  it('retries with sound at once when the film could already play', async () => {
    play.mockReset();
    play.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));
    play.mockResolvedValue(undefined);

    const { video } = await mount();

    expect(play).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(false);
  });

  it('plays with sound on an engine whose play() returns nothing', async () => {
    play.mockReset();
    play.mockReturnValue(undefined);

    const { video, onDone } = await mount();

    expect(video.muted).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('pins its overlay to the four edges of the screen', async () => {
    const { container } = await mount();

    const overlay = container.querySelector<HTMLElement>('.kroma-intro')?.style;
    expect([overlay?.top, overlay?.right, overlay?.bottom, overlay?.left]).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
  });

  it('paints the overlay and the film on a ground the browser accepts', async () => {
    const { container, video } = await mount();

    const overlay = container.querySelector<HTMLElement>('.kroma-intro');
    expect([overlay?.style.background, video.style.background]).not.toContain('');
  });

  it('lands the film on a tagline in a colour the browser accepts', async () => {
    const { video, getByText } = await mount({ tagline: 'Your library' });
    video.currentTime = 4.5;

    fire(video, 'timeupdate');

    expect(getByText('Your library').style.color).not.toBe('');
  });

  it('a gesture at the very top restarts the film with sound', async () => {
    const { video } = await mount();
    video.currentTime = 0.2;

    fire(document, 'pointerdown');

    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(3);
  });

  it('a gesture mid-film only unmutes: no click or stray key restarts it', async () => {
    const { video } = await mount();
    video.currentTime = 2.5;

    fire(document, 'pointerdown');
    press('ArrowRight');

    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(2.5);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('hands off after its fade once the film ends', async () => {
    const { video, onDone } = await mount();

    fire(video, 'ended');
    elapse(EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('plays again from the top when it loops', async () => {
    const { video, onDone } = await mount({ loop: true });
    video.currentTime = 5;

    fire(video, 'ended');
    elapse(SAFETY_MS * 4);

    expect(video.currentTime).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('ends a stalled film once its own length and the slack have passed', async () => {
    const { onDone } = await mount();

    elapse(5000 + SAFETY_SLACK_MS + EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('waits out the length its metadata gives rather than the default window', async () => {
    stubMedia(HTMLMediaElement.HAVE_ENOUGH_DATA, Number.NaN);
    const { video, onDone } = await mount();
    Object.defineProperty(video, 'duration', { value: 12 });

    fire(video, 'loadedmetadata');
    elapse(SAFETY_MS + EXIT_MS);

    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('KromaIntro mounted while the page is hidden', () => {
  beforeEach(() => {
    stubMedia(HTMLMediaElement.HAVE_NOTHING, Number.NaN);
    play.mockReset();
    play.mockResolvedValue(undefined);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  });

  afterEach(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('keeps the film waiting while the page is still parked', async () => {
    const { onDone } = await mount();

    elapse(SAFETY_MS + EXIT_MS);

    expect(onDone).not.toHaveBeenCalled();
  });

  it('hands off anyway once the re-checks run out', async () => {
    const { onDone } = await mount();

    elapse((HIDDEN_RECHECKS + 1) * SAFETY_MS + EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('plays the film as soon as the page is shown', async () => {
    await mount();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });

    fire(document, 'visibilitychange');

    expect(play).toHaveBeenCalled();
  });
});
