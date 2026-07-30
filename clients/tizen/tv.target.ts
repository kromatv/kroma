import type { TvTarget } from '@kroma/bundler/shell';

// Samsung Tizen. Modern tier: Tizen 8+ (Chromium 108, 2024 models). Legacy tier:
// Tizen 6.0-7.0 (Chromium 76-94, 2021-2023) - Samsung freezes Chromium per Tizen
// major (4.0 = 56, 5.0 = 63, 5.5 = 69, 6.0 = 76, 6.5 = 85, 7.0 = 94, 8.0 = 108,
// 9.0 = 120), and Tailwind v4's cascade layers need Chrome 99.
//
// The legacy tier is not a nicety here, it is what makes `required_version="6.0"`
// in config.xml true. Modern-only, that manifest offered the app to every set
// from 2021 on and then handed 2021 a bundle its engine cannot even parse
// (`?.`/`??` are Chrome 80) and 2022-2023 one whose every @layer block their
// engine drops on the floor - install, black or unstyled screen, one-star.
//
// The tier itself is built down to Chromium 53 (the same output webOS's 2018
// sets get), so the floor is set by what has been TESTED, not by the bundle:
// lowering required_version to reach Tizen 5.0 (2019) is a one-line change once
// somebody has run it on such a set.
//
// `deviceDev` honors KROMA_TV_DEVICE=1 for on-device live-dev over the LAN
// (scripts/dev-device.sh + `make dev-shell`).
export const target: TvTarget = {
  platform: 'tizen',
  port: 5174,
  deviceDev: true,
  legacyChrome: 53,
};
