import type { Runtime } from '../../television';
import { AndroidProps } from './schemas';

const MAX_OUTPUT_CHARS = 256 * 1024;

const PHILIPS_ANDROID_FLOOR: Readonly<Record<number, string>> = {
  2016: '5',
  2017: '6',
  2018: '8',
  2019: '9',
  2020: '9',
  2021: '10',
  2022: '11',
  2023: '11',
};

/** The `[key]: [value]` lines `adb shell getprop` prints, cut to the ones this tool reads. */
export function androidProps(output: string): AndroidProps {
  const printed: Record<string, string> = {};
  for (const line of output.slice(0, MAX_OUTPUT_CHARS).split('\n')) {
    const [, key, value] = /^\[([^\]]+)]: \[(.*)]$/.exec(line.trim()) ?? [];
    if (key !== undefined) printed[key] = value ?? '';
  }
  const parsed = AndroidProps.safeParse(printed);
  return parsed.success ? parsed.data : {};
}

/**
 * What an Android set says it runs, with the system WebView as its engine: the
 * major of the `versionName` that `dumpsys package com.google.android.webview`
 * prints. Null for a set that named no Android version.
 */
export function androidRuntime(props: AndroidProps, webview: string): Runtime | null {
  const version = props['ro.build.version.release'];
  if (!version) return null;
  const major = /versionName=(\d+)/.exec(webview.slice(0, MAX_OUTPUT_CHARS))?.[1];
  return {
    name: 'Android',
    version,
    engine: major === undefined ? null : { name: 'WebView', version: major },
    learned: 'reported',
  };
}

/**
 * The oldest Android a Philips build tag dates a set to, for the sets adb
 * cannot reach: `MSAF_2019_ANDROID_TV` shipped Android 9. Null unless the tag
 * names Android and carries a year the table holds.
 */
export function philipsAndroid(osType: string | undefined): Runtime | null {
  const tag = (osType ?? '').toUpperCase();
  if (!tag.includes('ANDROID')) return null;
  const year = /(?:^|_)(20\d{2})(?:_|$)/.exec(tag)?.[1];
  const version = year === undefined ? undefined : PHILIPS_ANDROID_FLOOR[Number(year)];
  return version === undefined
    ? null
    : { name: 'Android', version, engine: null, learned: 'derived' };
}
