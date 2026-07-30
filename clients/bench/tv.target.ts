import type { TvTarget } from '@kroma/bundler/shell';

/** The bench runs on the modern tier: it measures the components, not the
 * legacy shims. */
export const target: TvTarget = {
  platform: 'bench',
  port: 5199,
};
