/**
 * KROMA Smart Hub preview background service.
 *
 * The Samsung TV runs this (separately from the UI, even while KROMA is closed)
 * to publish the "new movies" carousel shown on the home screen when the KROMA
 * tile is focused. The foreground app writes the tile JSON to the package's
 * private `wgt-private/preview.json`; this service reads it and hands it to
 * webapis.preview.setPreviewData().
 *
 * Runtime notes: this is a Tizen JS service (a Node-like context). Node's `fs`
 * is NOT available file access goes through tizen.filesystem. `tizen` and
 * `webapis` are globals here (typed in ./tizen-service.d.ts), with no <script>
 * include.
 *
 * It is NOT part of the app bundle: the platform loads it on its own, so it is
 * emitted separately by scripts/build-service.ts into dist/service/ as one
 * self-contained CommonJS file. That emitter is also what makes `?.` safe to
 * write here - it lowers to ES5, and config.xml offers the app from Tizen 6.0,
 * whose Chromium 76 cannot parse optional chaining. Authored by hand in
 * public/, it once shipped `?.` straight to those sets.
 */

const PRIVATE_DIR = 'wgt-private';
const PREVIEW_FILE = 'preview.json';

/** A caught value is `unknown`; read `.message` only when there is one. */
function message(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : undefined;
}

function log(msg: string) {
  // `console` may be absent in the Tizen service runtime, so guard it.
  try {
    if (typeof console !== 'undefined' && console.log) {
      console.log(`[kroma preview] ${msg}`);
    }
  } catch (_e) {
    /* logging must never break the service */
  }
}

function exit() {
  try {
    tizen.application.getCurrentApplication().exit();
  } catch (_e) {
    /* nothing else to do */
  }
}

function readPreviewData(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    tizen.filesystem.resolve(
      PRIVATE_DIR,
      (dir) => {
        let file: TizenFile;
        try {
          file = dir.resolve(PREVIEW_FILE);
        } catch (e) {
          reject(e);
          return;
        }
        file.openStream(
          'r',
          (stream) => {
            let data = '';
            try {
              if (stream.bytesAvailable > 0) {
                data = stream.read(stream.bytesAvailable);
              }
            } catch (e) {
              stream.close();
              reject(e);
              return;
            }
            stream.close();
            resolve(data);
          },
          reject,
          'UTF-8',
        );
      },
      reject,
      'r',
    );
  });
}

function publish(data: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!data) {
      reject(new Error('no preview data on disk yet'));
      return;
    }
    log(`read ${data.length} bytes from disk`);
    // Bound to a local so the presence check narrows the call below: the API is
    // genuinely optional (an older set may not expose it at all), and reading it
    // twice is what let a TypeError past the guard.
    const preview = typeof webapis !== 'undefined' ? webapis.preview : undefined;
    log(`webapis.preview.setPreviewData present: ${!!preview?.setPreviewData}`);
    if (!preview?.setPreviewData) {
      reject(new Error('webapis.preview.setPreviewData unavailable'));
      return;
    }
    try {
      preview.setPreviewData(
        data,
        () => {
          resolve();
        },
        (err) => {
          reject(err);
        },
      );
    } catch (e) {
      reject(e);
    }
  });
}

function refresh() {
  readPreviewData()
    .then(publish)
    .then(() => {
      log('preview published OK');
    })
    .catch((err) => {
      log(`skip: ${message(err) ?? JSON.stringify(err)}`);
    })
    .then(exit, exit);
}

function safe(fn: () => void): () => void {
  return () => {
    try {
      fn();
    } catch (e) {
      log(`lifecycle error: ${message(e) ?? String(e)}`);
      exit();
    }
  };
}

// The three lifecycle hooks the platform calls, as a plain object literal.
// `.cts` (TypeScript CommonJS) rather than `.ts`: this package is
// `"type": "module"`, and authoring ESM here would make the emitter wrap the
// exports in an interop shim that turns them into getters. The platform has
// been calling a literal for as long as this service has existed; there is no
// TV here to prove a getter is equivalent.
module.exports = {
  onStart: safe(() => {
    log('service start');
  }),
  onRequest: safe(() => {
    log('onRequest');
    refresh();
  }),
  onExit: safe(() => {
    log('service exit');
  }),
};
