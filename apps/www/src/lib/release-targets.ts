import { SamsungIcon } from '#site/components/download/samsung-icon';
import { LgIcon } from '#site/components/download/lg-icon';
import { LinuxIcon } from '#site/components/download/linux-icon';
import {
  IconBrandAndroid,
  IconBrandApple,
  IconBrandDebian,
  IconBrandWindows,
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
 *
 * Samsung and LG get the native app, a `.tpk` and an `.ipk` built from
 * `clients/tv-native`. Samsung's web `.wgt` stays for the 2017-2020 sets that
 * refuse a native library. LG's web `.ipk` (`tv.kroma.webos_*`) has no row: the
 * native one reaches every set it did.
 */
export const TARGET_IDS = [
  'tizen',
  'tizen-web',
  'webos',
  'androidtv',
  'macos',
  'macos-intel',
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
    ext: '.tpk',
    arch: null,
    asset: /^KROMA-tizen-\d.*\.tpk$/,
    icon: SamsungIcon,
  },
  'tizen-web': {
    label: 'Samsung',
    ext: '.wgt',
    arch: '2017-2020',
    asset: /^KROMA-tizen-\d.*\.wgt$/,
    icon: SamsungIcon,
  },
  webos: {
    label: 'LG',
    ext: '.ipk',
    arch: null,
    asset: /^KROMA-webos-\d.*\.ipk$/,
    icon: LgIcon,
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
  'macos-intel': {
    label: 'macOS',
    ext: '.dmg',
    arch: 'Intel',
    asset: /^KROMA_.+_x64\.dmg$/,
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
    icon: LinuxIcon,
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
