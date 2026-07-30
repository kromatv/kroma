// Must run before `expo prebuild`: the generated Gradle/pbxproj projects bake
// version/build values from app.json at generation time.
//
// The build number must be unique and always increasing (App Store Connect and
// Play both reject a repeat or a decrease); minutes since 2020-01-01 UTC gives
// that with no state carried between runs, matching the Android TV job.

import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(`usage: stamp-mobile-version.ts <x.y.z> (got ${JSON.stringify(process.argv[2])})`);
  process.exit(1);
}

const EPOCH_2020 = 1577836800; // 2020-01-01T00:00:00Z, same base as the Android TV job
const build = Math.floor((Math.floor(Date.now() / 1000) - EPOCH_2020) / 60);

const path = 'clients/mobile/app.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
config.expo.version = version;
config.expo.ios = { ...config.expo.ios, buildNumber: String(build) };
config.expo.android = { ...config.expo.android, versionCode: build };
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`app.json stamped: version ${version}, build ${build}`);
