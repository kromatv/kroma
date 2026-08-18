// Ships Media3's FFmpeg audio decoders with the Android app; see README.md for why
// the .aar is vendored and why the expo-video patch is the other half of it.

const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const AAR = 'media3-decoder-ffmpeg-1.9.0.aar';
const DEPENDENCY = `    implementation files("libs/${AAR}")`;
const ANCHOR = 'dependencies {';

const withAar = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const libs = path.join(cfg.modRequest.platformProjectRoot, 'app', 'libs');
      fs.mkdirSync(libs, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'android', AAR), path.join(libs, AAR));
      return cfg;
    },
  ]);

const withDependency = (config) =>
  withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    // Idempotent: prebuild without --clean re-runs plugins over a patched file.
    if (contents.includes(AAR)) return cfg;
    if (!contents.includes(ANCHOR)) {
      throw new Error(
        `@kroma/media3-ffmpeg: no "${ANCHOR}" block in app/build.gradle. The Expo ` +
          'template changed - re-point this plugin, or every DTS and TrueHD track ' +
          'goes back to being transcoded by the server.',
      );
    }
    cfg.modResults.contents = contents.replace(ANCHOR, `${ANCHOR}\n${DEPENDENCY}`);
    return cfg;
  });

const withMedia3Ffmpeg = (config) => withDependency(withAar(config));

module.exports = createRunOncePlugin(withMedia3Ffmpeg, '@kroma/media3-ffmpeg', '0.0.0');
