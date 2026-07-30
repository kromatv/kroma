// The dynamic half of the kit app's Expo config: app.json holds everything
// static; this adds the one thing a JSON file cannot state - which build this
// is (git commit, branch, compile time, repository). Reports the kit's OWN
// package version, not the product's - the two move independently.

const { collectBuildInfo } = require('../build-info');

module.exports = function kitAppConfig({ config }) {
  return { ...config, extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) } };
};
