import type { TvTarget } from '@kroma/bundler/shell';

// The 10-foot experience served from an origin instead of packaged into a
// .wgt/.ipk. No legacy tier: a browser that can be pointed at this URL is past
// the modern tier's Chrome 99 floor.
export const target: TvTarget = {
  platform: 'web',
  port: 5179,
};
