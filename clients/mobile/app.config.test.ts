import path from 'node:path';
import { productLocales } from '@kromatv/build-info';
import { describe, expect, it } from 'vitest';
import mobileAppConfig from './app.config';

describe('mobileAppConfig', () => {
  it('declares every language the product offers to iOS, beside the static plist', () => {
    const config = mobileAppConfig({
      config: {
        name: 'KROMA',
        slug: 'kroma',
        ios: { infoPlist: { UIBackgroundModes: ['fetch'] } },
      },
      projectRoot: __dirname,
      staticConfigPath: path.join(__dirname, 'app.json'),
      packageJsonPath: path.join(__dirname, 'package.json'),
    });

    expect(config.ios?.infoPlist).toEqual({
      UIBackgroundModes: ['fetch'],
      CFBundleLocalizations: productLocales(path.join(__dirname, '..', '..')),
    });
  });
});
