// TypeScript, and therefore ESM: this package is `"type": "module"` (it is a
// Vite site as well as an Expo app), so the config is loaded as a module and
// `module.exports` would be undefined. Babel accepts `babel.config.ts` - it is
// in its own ROOT_CONFIG_FILENAMES - and reads the default export.
interface BabelApi {
  cache(enabled: boolean): void;
}

export default function kitBabelConfig(api: BabelApi) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
}
