import { describe, expect, it } from 'vitest';
import { androidProps, androidRuntime, philipsAndroid } from './runtime';

const getprop = `[net.bt.name]: [Android]
[ro.build.version.release]: [12]
[ro.build.version.sdk]: [31]
[ro.product.manufacturer]: [Sony]
[ro.product.model]: [BRAVIA 4K VH2]`;

const dumpsys = `Packages:
  Package [com.google.android.webview] (9f3c1a2):
    userId=10091
    versionCode=560308833 minSdk=29 targetSdk=33
    versionName=108.0.5359.128`;

describe('androidProps', () => {
  it('keeps only the properties this tool reads out of everything getprop printed', () => {
    expect(androidProps(getprop)).toEqual({
      'ro.build.version.release': '12',
      'ro.product.manufacturer': 'Sony',
      'ro.product.model': 'BRAVIA 4K VH2',
    });
  });

  it('answers no properties for output in no shape getprop ever prints', () => {
    expect(androidProps('error: device unauthorized.')).toEqual({});
  });
});

describe('androidRuntime', () => {
  it('names the Android a set reports and the WebView it has installed', () => {
    expect(androidRuntime(androidProps(getprop), dumpsys)).toEqual({
      name: 'Android',
      version: '12',
      engine: { name: 'WebView', version: '108' },
      learned: 'reported',
    });
  });

  it('leaves the engine out when the WebView package answered nothing', () => {
    expect(androidRuntime(androidProps(getprop), '')).toMatchObject({
      version: '12',
      engine: null,
    });
  });

  it('answers nothing when the set named no Android version', () => {
    expect(androidRuntime({}, dumpsys)).toBeNull();
  });
});

describe('philipsAndroid', () => {
  it('floors a Philips at the Android its build year shipped with', () => {
    expect(philipsAndroid('MSAF_2019_ANDROID_TV')).toEqual({
      name: 'Android',
      version: '9',
      engine: null,
      learned: 'derived',
    });
  });

  it('answers nothing for a Philips whose build names no Android', () => {
    expect(philipsAndroid('SAPHI')).toBeNull();
  });

  it('answers nothing for a build year no Philips shipped Android in', () => {
    expect(philipsAndroid('MSAF_2035_ANDROID_TV')).toBeNull();
  });
});
