import { describe, expect, it } from 'vitest';
import { playedStream } from './played-stream';

describe('the mode a playlist came back in', () => {
  it('reads a copy of both axes as a repackaging', () => {
    expect(playedStream('copy')).toEqual({ mode: 'remux', aac: false });
  });

  it('reads a soundtrack the server re-encoded, whichever filter it used', () => {
    expect(playedStream('aac')).toEqual({ mode: 'transcode', aac: true });
    expect(playedStream('aac-night')).toEqual({ mode: 'transcode', aac: true });
  });

  it('reads a picture the server re-encoded beside a soundtrack it copied', () => {
    expect(playedStream('h264-copy')).toEqual({ mode: 'transcode', aac: false });
    expect(playedStream('h264-1080-copy')).toEqual({ mode: 'transcode', aac: false });
  });

  it('reads both axes re-encoded at a rung', () => {
    expect(playedStream('h264-720-aac-standard')).toEqual({ mode: 'transcode', aac: true });
  });

  it('names no mode for a header the server never sent or this client cannot read', () => {
    expect(playedStream(null)).toBeNull();
    expect(playedStream('')).toBeNull();
    expect(playedStream('av1-opus')).toBeNull();
  });
});
