// Foreground half of the Tizen Smart Hub preview: the carousel is published by a
// background service (config.xml `use.preview = bg_service`) that cannot reach
// KROMA itself, so this writes the tile JSON where that service can read it.

import type { ContinueItem, KromaClient, MediaItem } from '@kroma/core';
import { buildPreviewData } from '#tv/shared/preview/cards';
import { type Tizen, type TizenFile, tizen } from '#tv/shared/preview/tizen';

// Must match the <tizen:service id> in clients/tizen/public/config.xml.
const SERVICE_ID = 'KromaTV001.PreviewSvc';
const PRIVATE_DIR = 'wgt-private';
const PREVIEW_FILE = 'preview.json';
// Samsung policy: preview data should not refresh more than ~once per 10 min.
const REPUBLISH_MS = 10 * 60 * 1000;

function writePrivateFile(t: Tizen, name: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    t.filesystem.resolve(
      PRIVATE_DIR,
      // Anything thrown in here is thrown inside the platform's callback, not
      // inside the executor, so without this it escapes as an uncaught error and
      // the promise never settles: the caller waits forever. A firmware that
      // answers `resolve` and then hands back nothing usable is exactly the
      // shape an older set fails in.
      (dir) => {
        try {
          let file: TizenFile | null;
          try {
            file = dir.resolve(name);
          } catch {
            file = dir.createFile(name);
          }
          if (!file) throw new Error(`tizen filesystem gave no file for ${name}`);
          file.openStream(
            'w',
            // Its own callback, on its own turn of the platform's stack, so it
            // needs its own guard: a write that throws would otherwise escape
            // exactly the way the one above does.
            (stream) => {
              try {
                try {
                  stream.write(data);
                } finally {
                  stream.close();
                }
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            reject,
            'UTF-8',
          );
        } catch (error) {
          reject(error);
        }
      },
      reject,
      'rw',
    );
  });
}

// Best-effort: the TV polls the service on its own schedule too, so a failure
// here only delays the refresh.
function nudgeService(t: Tizen): void {
  try {
    const ctl = new t.ApplicationControl('http://tizen.org/appcontrol/operation/pick');
    t.application.launchAppControl(ctl, SERVICE_ID, undefined, () => undefined);
  } catch {
    /* ignore */
  }
}

let lastNudge = 0;

/** Persist the carousel and (throttled) ask the service to publish it. No-op
 *  off Tizen. */
export async function publishPreview(client: KromaClient, movies: MediaItem[]): Promise<void> {
  const t = tizen();
  if (!t) return;
  let continueItems: ContinueItem[] = [];
  try {
    continueItems = await client.continueWatching();
  } catch {
    /* not logged in / no progress yet */
  }
  const data = buildPreviewData(client, movies, continueItems);
  if (!data) return;
  try {
    await writePrivateFile(t, PREVIEW_FILE, data);
    const now = Date.now();
    if (now - lastNudge >= REPUBLISH_MS) {
      lastNudge = now;
      nudgeService(t);
    }
  } catch {
    /* best-effort: the carousel keeps its previous contents */
  }
}
