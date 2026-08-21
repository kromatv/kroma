/**
 * The installers a push to `main` leaves on its run, keyed by the platform each
 * one installs on.
 *
 * Exactly what `_release-*.yml` uploads on a push that someone can actually
 * install. The two `.ipa` bundles are not here: TestFlight and the App Store are
 * the only ways onto an Apple device, so a downloaded one installs nowhere. The
 * Synology `.spk` is built by `synology.yml` on its own run and reaches the site
 * from the rolling tag it publishes to. Tizen ships one signed package carrying
 * all three engine tiers and choosing at runtime; `ci.yml` also slices those
 * tiers apart, but into unsigned directories a set would refuse.
 */
export const TARGET_IDS = [
  'tizen',
  'webos',
  'androidtv',
  'android',
  'macos',
  'windows',
  'linux',
] as const;

export type TargetId = (typeof TARGET_IDS)[number];

interface Target {
  artifact: string;
  label: string;
  /**
   * An artifact is always a zip and the listing API never names its contents,
   * which is why this is written down rather than read.
   */
  contains: readonly string[];
}

export const TARGETS: Readonly<Record<TargetId, Target>> = {
  tizen: { artifact: 'kroma-tizen-wgt', label: 'Samsung', contains: ['.wgt'] },
  webos: { artifact: 'kroma-webos-ipk', label: 'LG', contains: ['.ipk'] },
  androidtv: { artifact: 'kroma-androidtv-apk', label: 'Android TV', contains: ['.apk'] },
  android: { artifact: 'kroma-mobile-apk', label: 'Android', contains: ['.apk'] },
  macos: { artifact: 'kroma-desktop-macos', label: 'macOS', contains: ['.dmg'] },
  windows: { artifact: 'kroma-desktop-windows', label: 'Windows', contains: ['.exe', '.msi'] },
  linux: { artifact: 'kroma-desktop-linux', label: 'Linux', contains: ['.AppImage', '.deb'] },
};

export function classify(artifactName: string): TargetId | null {
  return TARGET_IDS.find((id) => TARGETS[id].artifact === artifactName) ?? null;
}
