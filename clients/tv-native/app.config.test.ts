import path from 'node:path';
import { productLocales } from '@kromatv/build-info';
import type { ExpoConfig } from 'expo/config';
import { describe, expect, it } from 'vitest';
import tvNativeAppConfig from './app.config';

const STATIC: ExpoConfig = {
  name: 'KROMA',
  slug: 'kroma-tv',
  ios: { infoPlist: { CFBundleAllowMixedLocalizations: true } },
  plugins: [
    ['@kromatv/android-build/plugin', { formFactor: 'tv' }],
    ['@kromatv/react-native-tv', { package: 'tv.kroma.app' }],
    'expo-speech-recognition',
  ],
};

function configured(): Partial<ExpoConfig> {
  return tvNativeAppConfig({
    config: STATIC,
    projectRoot: __dirname,
    staticConfigPath: path.join(__dirname, 'app.json'),
    packageJsonPath: path.join(__dirname, 'package.json'),
  });
}

describe('tvNativeAppConfig', () => {
  it('gives the TV plugin and the tvOS app every language the product offers', () => {
    const locales = productLocales(path.join(__dirname, '..', '..'));

    const config = configured();

    expect(locales).toEqual(expect.arrayContaining(['en', 'fr']));
    expect(config.ios?.infoPlist).toEqual({
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: locales,
    });
    expect(config.plugins).toEqual([
      ['@kromatv/android-build/plugin', { formFactor: 'tv' }],
      ['@kromatv/react-native-tv', { package: 'tv.kroma.app', locales }],
      'expo-speech-recognition',
    ]);
  });
});
