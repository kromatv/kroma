import type { ConfigPlugin } from 'expo/config-plugins';
import { AndroidConfig, createRunOncePlugin, withAndroidManifest } from 'expo/config-plugins';

const withCleartextTraffic: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });

export default createRunOncePlugin(withCleartextTraffic, 'with-cleartext-traffic', '1.0.0');
