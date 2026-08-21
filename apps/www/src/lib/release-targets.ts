import {
  IconBrandAndroid,
  IconBrandApple,
  IconBrandDebian,
  IconBrandUbuntu,
  IconBrandWindows,
  IconDeviceTv,
  IconDeviceTvOld,
  IconServer,
} from '@tabler/icons-react';
import type { IconComponent } from '#site/components/download/icon';

/**
 * Every file a visitor can install, keyed by the platform it installs on.
 *
 * A release also carries `.ipa` bundles for iOS and tvOS, `.kmod` module
 * sidecars, `latest.json`, the `.spk.info.json` and every `.sha256`/`.sig`
 * beside them. None is here: an App Store `.ipa` cannot be installed by whoever
 * downloads it, the modules have their own page, and a checksum is not a
 * product. Anything absent from this table is absent from the page.
 */
export const TARGET_IDS = [
  'tizen',
  'webos',
  'androidtv',
  'macos',
  'windows-exe',
  'windows-msi',
  'linux-appimage',
  'linux-deb',
  'android',
  'synology',
] as const;

export type TargetId = (typeof TARGET_IDS)[number];

interface Target {
  label: string;
  ext: string;
  arch: string | null;
  asset: RegExp;
  icon: IconComponent;
}

export const TARGETS: Readonly<Record<TargetId, Target>> = {
  tizen: {
    label: 'Samsung',
    ext: '.wgt',
    arch: null,
    asset: /^KROMA-tizen-.+\.wgt$/,
    icon: IconDeviceTv,
  },
  webos: {
    label: 'LG',
    ext: '.ipk',
    arch: null,
    asset: /^tv\.kroma\.webos_.+_all\.ipk$/,
    icon: IconDeviceTv,
  },
  androidtv: {
    label: 'Android TV',
    ext: '.apk',
    arch: null,
    asset: /^KROMA-androidtv-.+\.apk$/,
    icon: IconDeviceTvOld,
  },
  macos: {
    label: 'macOS',
    ext: '.dmg',
    arch: 'Apple silicon',
    asset: /^KROMA_.+_aarch64\.dmg$/,
    icon: IconBrandApple,
  },
  'windows-exe': {
    label: 'Windows',
    ext: '.exe',
    arch: 'x64',
    asset: /^KROMA_.+_x64-setup\.exe$/,
    icon: IconBrandWindows,
  },
  'windows-msi': {
    label: 'Windows',
    ext: '.msi',
    arch: 'x64',
    asset: /^KROMA_.+_x64_.+\.msi$/,
    icon: IconBrandWindows,
  },
  'linux-appimage': {
    label: 'Linux',
    ext: '.AppImage',
    arch: 'x86-64',
    asset: /^KROMA_.+_amd64\.AppImage$/,
    icon: IconBrandUbuntu,
  },
  'linux-deb': {
    label: 'Debian',
    ext: '.deb',
    arch: 'x86-64',
    asset: /^KROMA_.+_amd64\.deb$/,
    icon: IconBrandDebian,
  },
  android: {
    label: 'Android',
    ext: '.apk',
    arch: null,
    asset: /^KROMA-mobile-.+\.apk$/,
    icon: IconBrandAndroid,
  },
  synology: {
    label: 'Synology',
    ext: '.spk',
    arch: 'x86-64',
    asset: /^kroma-.+-x86_64\.spk$/,
    icon: IconServer,
  },
};

export function classify(assetName: string): TargetId | null {
  return TARGET_IDS.find((id) => TARGETS[id].asset.test(assetName)) ?? null;
}
