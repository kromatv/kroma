import type { ExportedConfig } from 'expo/config-plugins';
import { describe, expect, it } from 'vitest';
import withAndroidRelease from './plugin';
import type { AndroidFormFactor } from './version';

function configuration(formFactor: AndroidFormFactor) {
  return withAndroidRelease({ name: 'KROMA', slug: 'kroma' }, { formFactor }) as ExportedConfig;
}

const modRequest = {
  projectRoot: '/tmp/kroma',
  platformProjectRoot: '/tmp/kroma/android',
  platform: 'android' as const,
  modName: 'manifest',
  introspect: false,
  ignoreExistingNativeFiles: false,
};

describe('Android release Expo plugin', () => {
  it.each(['mobile', 'tv'] as const)('sets device filters for %s', async (formFactor) => {
    const config = configuration(formFactor);
    const action = config.mods?.android?.manifest;
    if (!action) throw new Error('Manifest mod was not registered');
    const result = await action({
      ...config,
      modRawConfig: config,
      modRequest,
      modResults: {
        manifest: {
          $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
          queries: [],
        },
      },
    });
    expect(result.modResults.manifest['uses-feature']).toEqual(
      formFactor === 'mobile'
        ? [{ $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'true' } }]
        : [
            { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'false' } },
            { $: { 'android:name': 'android.hardware.faketouch', 'android:required': 'false' } },
            { $: { 'android:name': 'android.software.leanback', 'android:required': 'true' } },
          ],
    );
  });

  it('updates existing TV feature declarations without dropping unrelated features', async () => {
    const config = configuration('tv');
    const action = config.mods?.android?.manifest;
    if (!action) throw new Error('Manifest mod was not registered');
    const result = await action({
      ...config,
      modRawConfig: config,
      modRequest,
      modResults: {
        manifest: {
          $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
          queries: [],
          'uses-feature': [
            { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'true' } },
            { $: { 'android:name': 'android.hardware.camera', 'android:required': 'false' } },
          ],
        },
      },
    });
    const features = result.modResults.manifest['uses-feature'] ?? [];
    expect(features).toHaveLength(4);
    expect(features[0]?.$['android:required']).toBe('false');
    expect(features[1]?.$['android:name']).toBe('android.hardware.camera');
  });

  it.each(['groovy', 'kt'] as const)('validates the %s Gradle template', async (language) => {
    const config = configuration('mobile');
    const action = config.mods?.android?.appBuildGradle;
    if (!action) throw new Error('Gradle mod was not registered');
    const run = action({
      ...config,
      modRawConfig: config,
      modRequest: { ...modRequest, modName: 'appBuildGradle' },
      modResults: {
        path: '/tmp/kroma/android/app/build.gradle',
        language,
        contents:
          'android {\n    buildTypes {\n        release { signingConfig signingConfigs.debug }\n    }\n}',
      },
    });
    if (language === 'kt') await expect(run).rejects.toThrow(/Groovy/);
    else expect((await run).modResults.contents).toContain('KROMA Android upload signing');
  });
});
