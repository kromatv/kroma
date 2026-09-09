import { collectBuildInfo } from '@kromatv/build-info';
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function kitAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  return { ...config, extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) } };
}
