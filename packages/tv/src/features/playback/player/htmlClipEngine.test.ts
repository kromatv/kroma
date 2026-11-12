import { describe, expect, it } from 'vitest';
import { fakeVideo } from '@kromatv/core/test';
import { fakeListeners } from './engine.fixture';
import { HtmlClipEngine } from './htmlClipEngine';

const TRAILER = 'http://kroma.test/api/trailers/movie/1061474/qu5n7RALVpE/stream?t=tk';

describe('a clip on the page video', () => {
  it('plays the file it was given as it is', () => {
    const fv = fakeVideo();

    new HtmlClipEngine(fv.el, TRAILER, fakeListeners());

    expect(fv.get('src')).toBe(TRAILER);
  });

  it('is ready once the element can play', () => {
    const fv = fakeVideo();
    const listeners = fakeListeners();
    new HtmlClipEngine(fv.el, TRAILER, listeners);

    fv.fire('canplay');

    expect(listeners.onReady).toHaveBeenCalled();
  });

  it('reports the playhead as the element reads it', () => {
    const fv = fakeVideo();
    const listeners = fakeListeners();
    new HtmlClipEngine(fv.el, TRAILER, listeners);
    fv.set('currentTime', 42);

    fv.fire('timeupdate');

    expect(listeners.onTime).toHaveBeenCalledWith(42);
  });

  it('takes its length from the element', () => {
    const fv = fakeVideo({ duration: 150 });
    const listeners = fakeListeners();
    const engine = new HtmlClipEngine(fv.el, TRAILER, listeners);

    fv.fire('durationchange');

    expect(listeners.onDuration).toHaveBeenCalledWith(150);
    expect(engine.duration()).toBe(150);
  });

  it('reads as no length while the element knows none', () => {
    const engine = new HtmlClipEngine(fakeVideo().el, TRAILER, fakeListeners());

    expect(engine.duration()).toBe(0);
  });

  it('seeks within the file', () => {
    const fv = fakeVideo();
    const engine = new HtmlClipEngine(fv.el, TRAILER, fakeListeners());

    engine.seekTo(30);

    expect(engine.position()).toBe(30);
  });

  it('plays at the rate it is asked for', () => {
    const fv = fakeVideo({ playbackRate: 1 });
    const engine = new HtmlClipEngine(fv.el, TRAILER, fakeListeners());

    engine.setRate(1.5);

    expect(fv.get('playbackRate')).toBe(1.5);
  });

  it('lets go of the file when it is destroyed', () => {
    const fv = fakeVideo();
    const engine = new HtmlClipEngine(fv.el, TRAILER, fakeListeners());

    engine.destroy();

    expect(fv.get('src')).toBe('');
    expect(fv.listenerCount('timeupdate')).toBe(0);
  });
});
