import type { TvTarget } from '@kroma/bundler/shell';

// LG freezes Chromium per webOS major: modern tier is webOS 24+ (Chromium 108),
// legacy tier webOS 4.x-23 (Chromium 53-94). webOS 3.x (Chromium 38, no CSS
// custom properties) is unsupported.
export const target: TvTarget = {
  platform: 'webos',
  port: 5175,
  legacyChrome: 53,
};
