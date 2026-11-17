import { describe, expect, it, vi } from 'vitest';
import { routeShakaFailure, shakaHttpStatus } from '#web/features/playback/stream-failure';

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

function route() {
  return { onGiveUp: vi.fn(), onRefused: vi.fn() };
}

describe('routeShakaFailure', () => {
  it('hands a segment the server no longer holds to the refusal', () => {
    const to = route();

    routeShakaFailure({ code: 1001, severity: 2, data: ['seg_00023.m4s', 404] }, to);

    expect(to.onRefused).toHaveBeenCalledWith(404);
    expect(to.onGiveUp).not.toHaveBeenCalled();
  });

  it('hands a segment refused for its credential to the refusal', () => {
    const to = route();

    routeShakaFailure({ code: 1001, severity: 2, data: ['seg_00023.m4s', 401] }, to);

    expect(to.onRefused).toHaveBeenCalledWith(401);
  });

  it('gives up on a server that kept failing past Shaka retries', () => {
    const to = route();

    routeShakaFailure({ code: 1001, severity: 2, data: ['seg_00023.m4s', 502] }, to);

    expect(to.onGiveUp).toHaveBeenCalledTimes(1);
    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('leaves a failure Shaka is still retrying to Shaka', () => {
    const to = route();

    routeShakaFailure({ code: 1001, severity: 1, data: ['seg_00023.m4s', 404] }, to);

    expect(to.onGiveUp).not.toHaveBeenCalled();
    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('leaves a fatal failure that carries no status to the media element', () => {
    const to = route();

    routeShakaFailure({ code: 3016, severity: 2, data: [] }, to);
    routeShakaFailure({ code: 1001, severity: 2, data: ['seg_00023.m4s'] }, to);

    expect(to.onGiveUp).not.toHaveBeenCalled();
    expect(to.onRefused).not.toHaveBeenCalled();
  });
});
