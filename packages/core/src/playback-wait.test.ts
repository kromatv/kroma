import { describe, expect, it } from 'vitest';
import { playheadWatch, type WaitSample, waitReason } from './playback-wait';

const PLAYING: WaitSample = {
  intent: true,
  attaching: false,
  readyState: 4,
  networkState: 1,
  seeking: false,
  ended: false,
  frozen: false,
};

const at = (patch: Partial<WaitSample>): WaitSample => ({ ...PLAYING, ...patch });

describe('waitReason', () => {
  it('waits for nothing while a film plays with data ahead', () => {
    expect(waitReason(PLAYING)).toBeNull();
  });

  it('waits for nothing on a paused film with a frame to show', () => {
    expect(waitReason(at({ intent: false, readyState: 2 }))).toBeNull();
  });

  it('is loading while the source is still on its way to the element', () => {
    expect(waitReason(at({ attaching: true, readyState: 0, networkState: 0 }))).toBe('loading');
    expect(waitReason(at({ attaching: true, intent: false, readyState: 0 }))).toBe('loading');
  });

  it('is loading while a seek is in flight, playing or paused', () => {
    expect(waitReason(at({ seeking: true }))).toBe('loading');
    expect(waitReason(at({ seeking: true, intent: false }))).toBe('loading');
  });

  it('is loading before the first frame when a play is wanted', () => {
    expect(waitReason(at({ readyState: 1 }))).toBe('loading');
  });

  it('is loading before the first frame while the element is still fetching, even paused', () => {
    expect(waitReason(at({ intent: false, readyState: 0, networkState: 2 }))).toBe('loading');
  });

  it('waits for nothing on a paused element the browser stopped fetching for', () => {
    expect(waitReason(at({ intent: false, readyState: 1, networkState: 1 }))).toBeNull();
  });

  it('is buffering when a playing film has run out of data ahead', () => {
    expect(waitReason(at({ readyState: 2 }))).toBe('buffering');
  });

  it('is buffering when the playhead has frozen though the element claims enough data', () => {
    expect(waitReason(at({ readyState: 4, frozen: true }))).toBe('buffering');
  });

  it('waits for nothing once the film has ended', () => {
    expect(waitReason(at({ ended: true, readyState: 1, seeking: true }))).toBeNull();
  });
});

describe('playheadWatch', () => {
  it('calls a playing clock that has not moved for a while frozen', () => {
    const watch = playheadWatch();

    watch.observe(5.5, true, 0);

    expect(watch.observe(5.5, true, 500)).toBe(false);
    expect(watch.observe(5.5, true, 800)).toBe(true);
  });

  it('never calls a moving clock frozen', () => {
    const watch = playheadWatch();

    const verdicts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => watch.observe(i * 0.25, true, i * 250));

    expect(verdicts.every((frozen) => !frozen)).toBe(true);
  });

  it('starts the count over from the moment a paused film plays again', () => {
    const watch = playheadWatch();
    watch.observe(5.5, true, 0);
    watch.observe(5.5, false, 800);

    expect(watch.observe(5.5, true, 1000)).toBe(false);
    expect(watch.observe(5.5, true, 1500)).toBe(false);
    expect(watch.observe(5.5, true, 1800)).toBe(true);
  });
});
