import { describe, expect, it } from 'vitest';
import { LANE_NAMES, matchLanes } from './lanes';

const only = (...on: string[]) =>
  Object.fromEntries(LANE_NAMES.map((name) => [name, on.includes(name)]));

describe('matchLanes', () => {
  it('puts a docs-only change in no lane at all', () => {
    expect(matchLanes(['README.md', 'docs/tv-pairing.md', '.claude/CLAUDE.md'])).toEqual(only());
  });

  it('puts a server change in the rust and synology lanes only', () => {
    expect(matchLanes(['server/crates/kroma-db/src/lib.rs'])).toEqual(
      only('code', 'rust', 'synology'),
    );
  });

  it('puts a module sidecar change in rust and synology, and its ui in the fleet too', () => {
    expect(matchLanes(['modules/tv.kroma.vpn/server/src/lib.rs'])).toEqual(
      only('code', 'rust', 'synology'),
    );
    expect(matchLanes(['modules/tv.kroma.vpn/ui/src/index.tsx'])).toEqual(
      only('code', 'fleet', 'rust', 'synology'),
    );
  });

  it('keeps the Android compile for the native TV project alone', () => {
    expect(matchLanes(['packages/tv/src/features/home.tsx'])).toEqual(
      only('code', 'fleet', 'desktop', 'synology'),
    );
    expect(matchLanes(['clients/tv-native/modules/launcher/android/Row.kt'])).toEqual(
      only('code', 'fleet', 'android'),
    );
  });

  it('opens every lane for a lockfile change', () => {
    expect(matchLanes(['bun.lock'])).toEqual(
      only('code', 'fleet', 'android', 'desktop', 'synology', 'site'),
    );
  });

  it('opens every lane when the pipeline itself changes or the files cannot be listed', () => {
    const all = only(...LANE_NAMES);

    expect(matchLanes(['.github/workflows/ci.yml'])).toEqual(all);
    expect(matchLanes(['packages/ci-tools/src/lanes.ts'])).toEqual(all);
    expect(matchLanes('all')).toEqual(all);
  });

  it('puts the site in its own lane', () => {
    expect(matchLanes(['apps/www/src/routes/download.tsx'])).toEqual(only('code', 'fleet', 'site'));
  });
});
