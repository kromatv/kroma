// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fakeVideo } from '#web/features/playback/fake-video.fixture';
import { bindMediaEvents, type MediaEventSetters } from '#web/features/playback/media-events';
import type { MovieView } from '#web/shared/lib/api';

function mkSetters(): MediaEventSetters {
  return {
    setCur: vi.fn(),
    setDur: vi.fn(),
    setBufEnd: vi.fn(),
    setPlaying: vi.fn(),
    setWaiting: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setRate: vi.fn(),
    setReady: vi.fn(),
  };
}

const item = { id: 'w1', stream: 'stream://w1', durationMs: 7_200_000 } as unknown as MovieView;

describe('bindMediaEvents', () => {
  it('reports the absolute position from the anchor + element clock', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 100);
    fv.set('currentTime', 12);
    fv.fire('timeupdate');
    expect(s.setCur).toHaveBeenCalledWith(112);
  });

  it('prefers the catalogue runtime for duration, else the element duration', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 0);
    fv.fire('durationchange');
    expect(s.setDur).toHaveBeenCalledWith(7200);

    const fv2 = fakeVideo({ duration: 900 });
    const s2 = mkSetters();
    bindMediaEvents(fv2.el, { ...item, durationMs: 0 } as MovieView, s2, 10);
    fv2.fire('durationchange');
    expect(s2.setDur).toHaveBeenCalledWith(910);
  });

  it('prefers the known (server-header) duration over the element clock', () => {
    const fv = fakeVideo({ duration: 172 });
    const s = mkSetters();
    bindMediaEvents(fv.el, { ...item, durationMs: 0 } as MovieView, s, 0, 5_885_000);
    fv.fire('durationchange');
    expect(s.setDur).toHaveBeenCalledWith(5885);
  });

  it('reports the buffered end (anchor + last range), or 0 when empty', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 100);
    fv.fire('progress');
    expect(s.setBufEnd).toHaveBeenCalledWith(0);
    fv.setBuffered([
      [0, 30],
      [50, 80],
    ]);
    fv.fire('progress');
    expect(s.setBufEnd).toHaveBeenCalledWith(180);
  });

  it('maps pause / waiting / playing / volume / rate events', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 0);
    fv.fire('pause');
    expect(s.setPlaying).toHaveBeenCalledWith(false);
    fv.fire('waiting');
    expect(s.setWaiting).toHaveBeenCalledWith(true);
    fv.fire('playing');
    expect(s.setWaiting).toHaveBeenCalledWith(false);
    fv.set('volume', 0.5);
    fv.set('muted', true);
    fv.fire('volumechange');
    expect(s.setVolume).toHaveBeenCalledWith(0.5);
    expect(s.setMuted).toHaveBeenCalledWith(true);
    fv.set('playbackRate', 1.5);
    fv.fire('ratechange');
    expect(s.setRate).toHaveBeenCalledWith(1.5);
  });

  it('ready-gates autoplay: plays once when ready+paused, then a play event latches', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 0);
    fv.fire('canplay');
    expect(s.setReady).toHaveBeenCalledWith(true);
    expect(fv.playCalls()).toBe(1);
    fv.fire('play');
    expect(s.setPlaying).toHaveBeenCalledWith(true);
    fv.set('paused', true);
    fv.fire('canplay');
    expect(fv.playCalls()).toBe(1);
  });

  it('anchors at the element clock when no offset is given', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s);
    fv.set('currentTime', 12);
    fv.fire('timeupdate');
    expect(s.setCur).toHaveBeenCalledWith(12);
  });

  it('reports no duration at all while neither source knows one', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    bindMediaEvents(fv.el, { ...item, durationMs: 0 } as MovieView, s, 0);
    fv.fire('durationchange');
    expect(s.setDur).not.toHaveBeenCalled();
  });

  it('swallows an autoplay the browser refuses', () => {
    const fv = fakeVideo({ play: () => Promise.reject(new Error('NotAllowedError')) });
    const s = mkSetters();
    bindMediaEvents(fv.el, item, s, 0);
    expect(() => fv.fire('canplay')).not.toThrow();
    expect(s.setReady).toHaveBeenCalledWith(true);
  });

  it('cleanup detaches every listener', () => {
    const fv = fakeVideo();
    const s = mkSetters();
    const off = bindMediaEvents(fv.el, item, s, 0);
    off();
    fv.fire('timeupdate');
    fv.fire('pause');
    expect(s.setCur).not.toHaveBeenCalled();
    expect(s.setPlaying).not.toHaveBeenCalled();
  });
});
