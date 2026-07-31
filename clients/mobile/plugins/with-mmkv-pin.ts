// Pins MMKV to the last release that compiles.
//
// @kesha-antonov/react-native-background-downloader asks for 'MMKV >= 1.2.0',
// so every fresh `pod install` resolves the newest release. MMKV 2.4.1 added a
// secure_wipe() that calls memset_s on Apple (Core/aes/AESCrypt.cpp), and the
// declaration never materializes: the pod's prefix header pulls in <string.h>
// before the file's own `#define __STDC_WANT_LIB_EXT1__ 1` can take effect, so
// the archive dies on "use of undeclared identifier 'memset_s'" (first seen on
// the Xcode 26.6 runner image, 2026-07-30). 2.4.0 has no such call and built
// green on the same toolchain.
//
// MMKV 2.4.0 declares 'MMKVCore ~> 2.4.0', which still floats up to the broken
// 2.4.1 core, so BOTH pods are pinned. Drop this plugin when an MMKV release
// newer than 2.4.1 fixes the declaration.
//
// A config plugin rather than a hand-edit because clients/mobile/ios is
// generated: `expo prebuild` rewrites the Podfile on every run.

import fs from 'node:fs';
import path from 'node:path';
import type { ConfigPlugin } from 'expo/config-plugins';
import { createRunOncePlugin, withDangerousMod } from 'expo/config-plugins';

// Idempotency marker; also where a reader of the Podfile is sent for the why.
const MARKER = '# MMKV pinned (plugins/with-mmkv-pin.ts)';

// The template's one per-target line, inside `target ... do`, where pod
// declarations belong.
const ANCHOR = 'use_expo_modules!';

const ADDITIONS = `${MARKER}
  pod 'MMKV', '2.4.0'
  pod 'MMKVCore', '2.4.0'

  ${ANCHOR}`;

const withMmkvPin: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');
      if (!src.includes(MARKER)) {
        if (!src.includes(ANCHOR)) {
          throw new Error(
            'with-mmkv-pin: could not find the Podfile anchor - the template changed, update the plugin.',
          );
        }
        fs.writeFileSync(podfile, src.replace(ANCHOR, ADDITIONS));
      }
      return cfg;
    },
  ]);

export default createRunOncePlugin(withMmkvPin, 'with-mmkv-pin', '1.0.0');
