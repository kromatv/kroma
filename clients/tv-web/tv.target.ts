import type { TvTarget } from '../tv-build/shell';

// The 10-foot experience served from an origin (tv.kroma.tv) instead of packaged
// into a .wgt/.ipk. No platform SDK, no legacy tier: a browser new enough to be
// pointed at this URL is well past the modern tier's Chrome 99 floor, and the
// old-TV engines that need the legacy bundle can't reach a public URL anyway -
// they run the packaged app.
export const target: TvTarget = {
  platform: 'web',
  port: 5179,
};
