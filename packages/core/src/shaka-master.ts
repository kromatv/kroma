import { z } from 'zod';
import { type BufferPlan, shakaConfig } from './playback-buffer';
import { type FailureRoute, routeHttpStatus } from './stream-rescue';

const BAD_HTTP_STATUS = 1001;
const CRITICAL = 2;

const ShakaHttpError = z.object({
  code: z.literal(BAD_HTTP_STATUS),
  data: z.array(z.unknown()),
});

const ShakaCriticalHttpError = ShakaHttpError.extend({ severity: z.literal(CRITICAL) });

const HttpStatus = z.number().int();

function shakaHttpStatus(error: unknown): number | null {
  const parsed = ShakaHttpError.safeParse(error);
  if (!parsed.success) {
    return null;
  }
  const status = HttpStatus.safeParse(parsed.data.data[1]);
  return status.success ? status.data : null;
}

function routeStreamingFailure(error: unknown, route: FailureRoute): void {
  if (!ShakaCriticalHttpError.safeParse(error).success) {
    return;
  }
  const status = shakaHttpStatus(error);
  if (status !== null) {
    routeHttpStatus(status, route);
  }
}

/** The slice of a Shaka player `startShakaMaster` drives, typed structurally so
 * Shaka's generated namespace types stay out of every program. */
export interface ShakaPlayable {
  attach(media: HTMLMediaElement): Promise<void>;
  load(uri: string, startTime?: number | null): Promise<void>;
  configure(config: Record<string, unknown>): boolean;
  addEventListener(type: 'error', listener: (event: { detail?: unknown }) => void): void;
}

export interface ShakaMasterOptions {
  media: HTMLMediaElement;
  url: string;
  startSec: number;
  plan: BufferPlan;
  route: FailureRoute;
  stale: () => boolean;
}

/**
 * Plays an anchored master through `player` and sends `route` what it fails on,
 * until `stale` says the player is no longer the one on screen. Shaka stops
 * streaming for good on a fatal HTTP error: a refusal (see `streamRefusal`) goes
 * to `onRefused`, any other status to `onGiveUp`. A failure Shaka retries by
 * itself, as it does on a stream still being produced, goes nowhere. A load the
 * server refused hands its status to `onRefused`. Never rejects.
 */
export async function startShakaMaster(
  player: ShakaPlayable,
  opts: Readonly<ShakaMasterOptions>,
): Promise<void> {
  const { media, url, startSec, plan, route, stale } = opts;
  player.configure(shakaConfig(plan));
  player.addEventListener('error', (event) => {
    if (!stale()) {
      routeStreamingFailure(event.detail, route);
    }
  });
  try {
    await player.attach(media);
    await player.load(url, startSec);
  } catch (error: unknown) {
    const status = shakaHttpStatus(error);
    if (!stale() && status !== null) {
      route.onRefused(status);
    }
  }
}
