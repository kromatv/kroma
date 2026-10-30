import type { ConfigPlugin } from 'expo/config-plugins';
import { createRunOncePlugin, withAndroidManifest, withAppBuildGradle } from 'expo/config-plugins';
import { configureAndroidSigning } from './gradle.ts';
import type { AndroidFormFactor } from './version.ts';

const withAndroidRelease: ConfigPlugin<{ formFactor: AndroidFormFactor }> = (
  config,
  { formFactor },
) => {
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy')
      throw new Error('KROMA requires a Groovy app Gradle file');
    cfg.modResults.contents = configureAndroidSigning(cfg.modResults.contents);
    return cfg;
  });
  return withAndroidManifest(config, (cfg) => {
    const features = (cfg.modResults.manifest['uses-feature'] ??= []);
    const setFeature = (name: string, required: 'true' | 'false') => {
      const feature = features.find((entry) => entry.$['android:name'] === name);
      if (feature) feature.$['android:required'] = required;
      else features.push({ $: { 'android:name': name, 'android:required': required } });
    };
    setFeature('android.hardware.touchscreen', formFactor === 'mobile' ? 'true' : 'false');
    if (formFactor === 'tv') {
      setFeature('android.hardware.faketouch', 'false');
      setFeature('android.software.leanback', 'true');
    }
    return cfg;
  });
};

export default createRunOncePlugin(withAndroidRelease, 'kroma-android-release', '1.0.0');
