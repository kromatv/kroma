/** Seconds: a position at or under this is the top of the film, where an anchored
 * master starts by itself and no seek is owed. */
export const AT_FILM_START_SEC = 0.5;

const PLAYLIST_NOT_WRITTEN_YET = 503;
const ATTEMPTS = 4;
const FIRST_WAIT_MS = 500;

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/**
 * Asks for an anchored master, again while the server answers 503: a playlist
 * ffmpeg has not written yet while its session keeps running. The last answer is
 * handed back whatever it is. Abort `signal` once the anchor this was asked for
 * is abandoned, so a master nobody is waiting for cannot retire the session of
 * the anchor that replaced it.
 */
export async function fetchMaster(url: string, signal?: AbortSignal): Promise<Response> {
  const init = signal ? { signal } : undefined;
  let answer = await fetch(url, init);
  let wait = FIRST_WAIT_MS;
  for (let asked = 1; answer.status === PLAYLIST_NOT_WRITTEN_YET && asked < ATTEMPTS; asked += 1) {
    await sleep(wait);
    if (signal?.aborted) break;
    wait *= 2;
    answer = await fetch(url, init);
  }
  return answer;
}

/** The real start of an anchored master: the server seeks to the keyframe
 * at-or-before the requested anchor (`-noaccurate_seek`) and reports it via
 * the `X-Hls-Start` header. Using the requested anchor as `baseSec` would
 * drift the absolute clock by up to one GOP, desyncing the progress bar and
 * every subtitle cue after a resume/seek/audio switch. A master that never
 * answers, or answers without naming its start, keeps the requested anchor. */
export async function resolveMasterStart(url: string, requested: number): Promise<number> {
  if (requested <= AT_FILM_START_SEC) return 0;
  return readyMasterStart(url, requested);
}

/** [`resolveMasterStart`] that asks the server at every anchor, zero included,
 * for a native player that cannot retry a playlist it has not written yet. */
export async function readyMasterStart(url: string, requested: number): Promise<number> {
  const floor = requested <= AT_FILM_START_SEC ? 0 : requested;
  try {
    const r = await fetchMaster(url);
    if (r.status >= 400 || floor === 0) return floor;
    const real = namedStart(r);
    return Number.isFinite(real) ? real : floor;
  } catch {
    return floor;
  }
}

// `Number(null)` is a finite 0, so an absent header would place the anchor at
// the top of the film rather than where it was asked for.
function namedStart(answer: Response): number {
  const named = answer.headers.get('X-Hls-Start');
  return named === null ? Number.NaN : Number(named);
}
