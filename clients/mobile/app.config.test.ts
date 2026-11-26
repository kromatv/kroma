import path from 'node:path';
import { productLocales } from '@kromatv/build-info';
import { describe, expect, it } from 'vitest';
import mobileAppConfig from './app.config';

function resolve(plugins: NonNullable<Parameters<typeof mobileAppConfig>[0]['config']['plugins']>) {
  return mobileAppConfig({
    config: {
      name: 'KROMA',
      slug: 'kroma',
      ios: { infoPlist: { UIBackgroundModes: ['fetch'] } },
      plugins,
    },
    projectRoot: __dirname,
    staticConfigPath: path.join(__dirname, 'app.json'),
    packageJsonPath: path.join(__dirname, 'package.json'),
  });
}

describe('mobileAppConfig', () => {
  it('hands expo-localization every language the product offers, for both per-app settings', () => {
    const config = resolve(['expo-router', 'expo-localization']);

    expect(config.plugins).toEqual([
      'expo-router',
      ['expo-localization', { supportedLocales: productLocales(path.join(__dirname, '..', '..')) }],
    ]);
  });

  it('leaves the static plist as app.json wrote it', () => {
    const config = resolve(['expo-localization']);

    expect(config.ios?.infoPlist).toEqual({ UIBackgroundModes: ['fetch'] });
  });
});
