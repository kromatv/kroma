// The dynamic half of the mobile app's Expo config; app.json is the static file
// to edit. This collects the build's identity (git commit, branch, compile time)
// so the settings screen can show which build the user is running.

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { collectBuildInfo } from '../build-info';

export default function mobileAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  return {
    ...config,
    // Spread what came in: `extra` also carries whatever the plugins and EAS put
    // there, and replacing the object wholesale would drop it.
    extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) },
  };
}
