import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { LogLine } from '../run';

export interface Pinned {
  sha256: string;
  size: number;
}

/**
 * Writes what `url` serves to `dest`, and leaves nothing there when it fails.
 * Unpinned, a redirect is refused: these URLs serve the file directly, and
 * refusing a hop is what stops the download being pointed somewhere else.
 * Pinned, a redirect is followed, because bytes of another size or another
 * digest are refused wherever they came from.
 */
export async function download(
  url: string,
  dest: string,
  log: LogLine,
  pinned?: Pinned,
): Promise<void> {
  const response = await fetch(url, { redirect: pinned ? 'follow' : 'error' });
  if (!response.ok || !response.body) throw new Error(`GET ${url} answered ${response.status}`);

  const total = pinned?.size ?? Number(response.headers.get('content-length') ?? '0');
  const hash = createHash('sha256');
  let written = 0;
  let reported = 0;
  const metered = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      written += chunk.byteLength;
      if (pinned && written > pinned.size) throw new Error(`${url} serves more than it lists`);
      hash.update(chunk);
      const percent = total ? Math.floor((written / total) * 100) : 0;
      if (percent >= reported + 10) {
        reported = percent;
        log(`  ${percent}% of ${(total / 1e6).toFixed(0)} MB`);
      }
      yield chunk;
    }
  };

  const sink = createWriteStream(dest);
  try {
    await pipeline(response.body, metered, sink);
    if (pinned && (written !== pinned.size || hash.digest('hex') !== pinned.sha256)) {
      throw new Error(`${url} did not serve the file its release lists`);
    }
  } catch (error) {
    if (!sink.closed) await new Promise<void>((resolve) => sink.once('close', resolve));
    await rm(dest, { force: true });
    throw error;
  }
}
