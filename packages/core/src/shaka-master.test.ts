import { describe, expect, it, vi } from 'vitest';
import { fakeVideo } from './fake-video.fixture';
import { bufferPlan, shakaConfig } from './playback-buffer';
import { startShakaMaster } from './shaka-master';

const PLAN = bufferPlan(8_000_000);

function shakaPlayer(load: () => Promise<void> = () => Promise.resolve()) {
  const listeners: Array<(event: { detail?: unknown }) => void> = [];
  return {
    attach: vi.fn(() => Promise.resolve()),
    load: vi.fn(load),
    configure: vi.fn(() => true),
    addEventListener: vi.fn((_type: 'error', listener: (event: { detail?: unknown }) => void) => {
      listeners.push(listener);
    }),
    fail(detail: unknown) {
      for (const listener of listeners) {
        listener({ detail });
      }
    },
  };
}

function route() {
  return { onGiveUp: vi.fn(), onRefused: vi.fn() };
}

async function started(
  player: ReturnType<typeof shakaPlayer>,
  to = route(),
  stale: () => boolean = () => false,
) {
  const media = fakeVideo().el;
  await startShakaMaster(player, {
    media,
    url: 'master@42',
    startSec: 0,
    plan: PLAN,
    route: to,
    stale,
  });
  return { media, to };
}

describe('startShakaMaster', () => {
  it('loads the master from its start with the buffer sized for the title', async () => {
    const player = shakaPlayer();

    const { media } = await started(player);

    expect(player.configure).toHaveBeenCalledWith(shakaConfig(PLAN));
    expect(player.attach).toHaveBeenCalledWith(media);
    expect(player.load).toHaveBeenCalledWith('master@42', 0);
  });

  it('hands a segment the server no longer holds to the refusal', async () => {
    const player = shakaPlayer();
    const { to } = await started(player);

    player.fail({ code: 1001, severity: 2, data: ['seg_00023.m4s', 404] });

    expect(to.onRefused).toHaveBeenCalledWith(404);
    expect(to.onGiveUp).not.toHaveBeenCalled();
  });

  it('hands a segment refused for its credential to the refusal', async () => {
    const player = shakaPlayer();
    const { to } = await started(player);

    player.fail({ code: 1001, severity: 2, data: ['seg_00023.m4s', 401] });

    expect(to.onRefused).toHaveBeenCalledWith(401);
  });

  it('gives up on a server that kept failing past Shaka retries', async () => {
    const player = shakaPlayer();
    const { to } = await started(player);

    player.fail({ code: 1001, severity: 2, data: ['seg_00023.m4s', 502] });

    expect(to.onGiveUp).toHaveBeenCalledTimes(1);
    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('leaves a failure Shaka is still retrying to Shaka', async () => {
    const player = shakaPlayer();
    const { to } = await started(player);

    player.fail({ code: 1001, severity: 1, data: ['seg_00023.m4s', 404] });

    expect(to.onGiveUp).not.toHaveBeenCalled();
    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('leaves a fatal failure that carries no status to the media element', async () => {
    const player = shakaPlayer();
    const { to } = await started(player);

    player.fail({ code: 3016, severity: 2, data: [] });
    player.fail({ code: 1001, severity: 2, data: ['seg_00023.m4s'] });

    expect(to.onGiveUp).not.toHaveBeenCalled();
    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('ignores what the player reports once it is no longer on screen', async () => {
    const player = shakaPlayer();
    const { to } = await started(player, route(), () => true);

    player.fail({ code: 1001, severity: 2, data: ['seg_00023.m4s', 404] });

    expect(to.onRefused).not.toHaveBeenCalled();
  });

  it('hands the status a master was refused with to the refusal', async () => {
    const player = shakaPlayer(() =>
      Promise.reject({ code: 1001, data: ['https://x/index.m3u8', 401, '', {}] }),
    );

    const { to } = await started(player);

    expect(to.onRefused).toHaveBeenCalledWith(401);
  });

  it('swallows a load that failed without the server answering', async () => {
    const player = shakaPlayer(() => Promise.reject(new Error('boom')));

    const { to } = await started(player);

    expect(to.onRefused).not.toHaveBeenCalled();
    expect(to.onGiveUp).not.toHaveBeenCalled();
  });

  it('keeps a refused load to itself once the player is no longer on screen', async () => {
    const player = shakaPlayer(() => Promise.reject({ code: 1001, data: ['index.m3u8', 404] }));

    const { to } = await started(player, route(), () => true);

    expect(to.onRefused).not.toHaveBeenCalled();
  });
});
