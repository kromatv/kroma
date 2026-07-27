// Wires Siri's media intents into the app target that `expo prebuild` generates.
//
// Three things have to be true for Siri to route "cherche X dans KROMA" here,
// and all three live in files this repo does not keep (ios/ is generated), which
// is exactly what a config plugin is for:
//
//   1. the Siri entitlement, without which the intent never reaches the app;
//   2. the intents the app declares it answers, in Info.plist;
//   3. `application(_:handlerFor:)` on the app delegate, which is the in-app
//      alternative to shipping an Intents extension (tvOS 14+). Everything it
//      needs is in the local `siri-search` module, so the delegate only has to
//      point at it.
//
// The AppDelegate patch is a text insertion into generated Swift, so it is
// written to fail loudly: a template change that moves the anchor stops the
// build here, with a message saying what to look at, instead of quietly
// producing an app that Siri cannot talk to.

const {
  withEntitlementsPlist,
  withInfoPlist,
  withAppDelegate,
  createRunOncePlugin,
} = require('expo/config-plugins');

/** The intents KROMA answers. Both carry the spoken title. */
const INTENTS = ['INSearchForMediaIntent', 'INPlayMediaIntent'];

const HANDLER = `
  // Siri media intents, handled in the app rather than in an extension
  // (KromaMediaIntents, from the local siri-search module).
  public func application(_ application: UIApplication, handlerFor intent: INIntent) -> Any? {
    return KromaMediaIntents.handler(for: intent)
  }
`;

function withSiriEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.siri'] = true;
    return cfg;
  });
}

function withIntentsSupported(config) {
  return withInfoPlist(config, (cfg) => {
    // NSUserActivityTypes is what makes the OS offer these intents to the app;
    // the app is a media app, so both are always supported.
    const existing = cfg.modResults.NSUserActivityTypes ?? [];
    cfg.modResults.NSUserActivityTypes = [...new Set([...existing, ...INTENTS])];
    return cfg;
  });
}

function withIntentHandler(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('KromaMediaIntents.handler')) return cfg;

    const imports = 'import React\n';
    if (!contents.includes(imports)) {
      throw new Error(
        'with-siri-intents: could not find the import block in AppDelegate.swift. ' +
          'The Expo template changed - re-point this plugin before shipping, or Siri ' +
          'requests will never reach the app.',
      );
    }
    // `internal import` for the local module, not a plain one: the generated
    // file already uses explicit access-level imports (`internal import Expo`),
    // and Swift 6 rejects a plain import of a module that is internal elsewhere
    // ("ambiguous implicit access level"). Intents stays public: INIntent shows
    // up in the signature below.
    contents = contents.replace(imports, `${imports}import Intents\ninternal import SiriSearch\n`);

    // The end of the AppDelegate class: the first closing brace at column 0
    // after the class opens.
    const classStart = contents.indexOf('class AppDelegate: ExpoAppDelegate {');
    const classEnd = classStart === -1 ? -1 : contents.indexOf('\n}\n', classStart);
    if (classEnd === -1) {
      throw new Error(
        'with-siri-intents: could not find the AppDelegate class body in ' +
          'AppDelegate.swift. The Expo template changed - re-point this plugin.',
      );
    }
    cfg.modResults.contents = `${contents.slice(0, classEnd)}\n${HANDLER}${contents.slice(classEnd)}`;
    return cfg;
  });
}

const withSiriIntents = (config) =>
  withIntentHandler(withIntentsSupported(withSiriEntitlement(config)));

module.exports = createRunOncePlugin(withSiriIntents, 'kroma-siri-intents', '1.0.0');
