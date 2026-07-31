// The dynamic half of the kit app's Expo config: app.json holds everything
// static; this adds the one thing a JSON file cannot state - which build this
// is (git commit, branch, compile time, repository). Reports the kit's OWN
// package version, not the product's - the two move independently.

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { collectBuildInfo } from '../build-info';

export default function kitAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  return { ...config, extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) } };
}
