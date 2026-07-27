// `.cjs` rather than `.js`: this package is `"type": "module"` (it is a Vite
// site as well as an Expo app), so a plain `.js` config would be loaded as ESM
// and `module.exports` would be undefined. Metro and Babel both look for the
// `.cjs` spelling.
module.exports = function kitBabelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
