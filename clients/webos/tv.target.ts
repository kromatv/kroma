import type { TvTarget } from '@kroma/bundler/shell';

// LG webOS. Modern tier: webOS 24+ (Chromium 108). Legacy tier: webOS 4.x-23
// (Chromium 53-94, 2018-2023 models) - LG freezes Chromium per webOS major.
// webOS 3.x (Chromium 38: no CSS custom properties) is not supported.
export const target: TvTarget = {
  platform: 'webos',
  port: 5175,
  legacyChrome: 53,
};
