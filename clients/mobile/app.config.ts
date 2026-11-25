// The dynamic half of the mobile app's Expo config; app.json is the static file
// to edit. This collects the build's identity (git commit, branch, compile time)
// so the settings screen can show which build the user is running, and the
// languages `packages/core/src/locales/i18n.json` offers.

import path from 'node:path';
import { androidVersionCode } from '@kromatv/android-build';
import { collectBuildInfo, productLocales } from '@kromatv/build-info';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const repoRoot = path.join(__dirname, '..', '..');

export default function mobileAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  return {
    ...config,
    android: {
      ...config.android,
      ...(process.env.KROMA_VERSION_CODE
        ? { versionCode: androidVersionCode(Number(process.env.KROMA_VERSION_CODE), 'mobile') }
        : {}),
    },
    ios: {
      ...config.ios,
      infoPlist: { ...config.ios?.infoPlist, CFBundleLocalizations: productLocales(repoRoot) },
    },
    // Spread what came in: `extra` also carries whatever the plugins and EAS put
    // there, and replacing the object wholesale would drop it.
    extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) },
  };
}
