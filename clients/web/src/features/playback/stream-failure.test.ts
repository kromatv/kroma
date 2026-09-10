import { describe, expect, it } from 'vitest';
import { shakaHttpStatus } from '#web/features/playback/stream-failure';

describe('shakaHttpStatus', () => {
  it('reads the status out of a Shaka bad-HTTP-status error', () => {
    expect(shakaHttpStatus({ code: 1001, data: ['https://x/index.m3u8', 401, '', {}] })).toBe(401);
  });

  it('answers nothing for any other Shaka failure, an interrupted load included', () => {
    expect(shakaHttpStatus({ code: 7000, data: [] })).toBeNull();
    expect(shakaHttpStatus({ code: 1001, data: ['https://x/index.m3u8'] })).toBeNull();
  });

  it('answers nothing for something that is not a Shaka error at all', () => {
    expect(shakaHttpStatus(new Error('boom'))).toBeNull();
    expect(shakaHttpStatus(undefined)).toBeNull();
  });
});
