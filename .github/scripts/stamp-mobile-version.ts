// Must run before `expo prebuild`: the generated Gradle/pbxproj projects bake
// version/build values from app.json at generation time.
//
// The build number must be unique and always increasing (App Store Connect and
// Play both reject a repeat or a decrease). The run resolves one with
// `bun run ci version` (minutes since 2020-01-01 UTC) and passes it here, so
// every leg of a run stamps the same number; alone, this script takes the clock.

import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(
    `usage: stamp-mobile-version.ts <x.y.z> [build] (got ${JSON.stringify(process.argv[2])})`,
  );
  process.exit(1);
}

const EPOCH_2020 = 1577836800;
const given = Number(process.argv[3]);
const build =
  Number.isInteger(given) && given > 0
    ? given
    : Math.floor((Math.floor(Date.now() / 1000) - EPOCH_2020) / 60);

const path = 'clients/mobile/app.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
config.expo.version = version;
config.expo.ios = { ...config.expo.ios, buildNumber: String(build) };
config.expo.android = { ...config.expo.android, versionCode: build };
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`app.json stamped: version ${version}, build ${build}`);
