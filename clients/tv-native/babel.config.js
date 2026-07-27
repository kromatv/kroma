module.exports = function tvNativeBabelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
