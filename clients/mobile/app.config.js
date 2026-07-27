// The dynamic half of the mobile app's Expo config.
//
// app.json still holds everything static and is the file to edit; Expo hands it
// to this function as `config`, and all that happens here is the one thing a
// JSON file cannot do - COLLECT the build's own identity (git commit, branch,
// compile time, repository) so the settings screen can show which build the user
// is actually running. See ../build-info/index.js.

const { collectBuildInfo } = require('../build-info');

module.exports = function mobileAppConfig({ config }) {
  return {
    ...config,
    // Spread what came in: `extra` also carries whatever the plugins and EAS put
    // there, and replacing the object wholesale would drop it.
    extra: { ...config.extra, buildInfo: collectBuildInfo(__dirname) },
  };
};
