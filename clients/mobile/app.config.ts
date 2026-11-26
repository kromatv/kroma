// The dynamic half of the mobile app's Expo config; app.json is the static file
// to edit. This collects the build's identity (git commit, branch, compile time)
// so the settings screen can show which build the user is running, and hands
// expo-localization the languages `packages/core/src/locales/i18n.json` offers,
// which it lists in the per-app language settings of iOS and Android 13+.

import path from 'node:path';
import { androidVersionCode } from '@kromatv/android-build';
import { collectBuildInfo, productLocales } from '@kromatv/build-info';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const repoRoot = path.join(__dirname, '..', '..');

const LOCALIZATION_PLUGIN = 'expo-localization';

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];

function withSupportedLocales(plugin: PluginEntry, supportedLocales: string[]): PluginEntry {
  return plugin === LOCALIZATION_PLUGIN ? [LOCALIZATION_PLUGIN, { supportedLocales }] : plugin;
}

export default function mobileAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  const locales = productLocales(repoRoot);
  return {
    ...config,
    android: {
      ...config.android,
      ...(process.env.KROMA_VERSION_CODE
        ? { versionCode: androidVersionCode(Number(process.env.KROMA_VERSION_CODE), 'mobile') }
        : {}),
    },
    plugins: config.plugins?.map((plugin) => withSupportedLocales(plugin, locales)),
    // Spread what came in: `extra` also carries whatever the plugins and EAS put
    // there, and replacing the object wholesale would drop it.
    extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) },
  };
}
