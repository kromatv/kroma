// `.ts` rather than `.js`: this package is `"type": "module"`, so a plain `.js`
// config would be loaded as ESM and `module.exports` would be undefined.
interface BabelApi {
  cache(enabled: boolean): void;
}

export default function kitBabelConfig(api: BabelApi) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
}
