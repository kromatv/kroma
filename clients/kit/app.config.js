// The dynamic half of the kit app's Expo config.
//
// app.json still holds everything static and is the file to edit; this adds the
// one thing a JSON file cannot state - which build this is (git commit, branch,
// compile time, repository), for the line under the story tree.
//
// The kit reports its OWN package version rather than the product's: it ships
// the design system, not the player, and the two move independently. The Vite
// half of this app does the same through a `define`; see vite.config.ts.

const { collectBuildInfo } = require('../build-info');

module.exports = function kitAppConfig({ config }) {
  return { ...config, extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) } };
};
