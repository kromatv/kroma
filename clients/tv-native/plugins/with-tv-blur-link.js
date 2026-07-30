// Makes expo-blur LINK on tvOS at all.
//
// The kit's <Frost> renders the shell's registered BlurView (see App.tsx), and
// expo-blur is the first Expo VIEW module this app ships. Linking it surfaces
// two facts about the tvOS toolchain that never mattered before:
//
// 1. The prebuilt React core (react-native-tvos 0.86.0-2) ships RELEASE
//    flavoured only, on every slice: symbols that exist under
//    `REACT_NATIVE_DEBUG` (Sealable's out-of-line constructors) are not in it,
//    so a Debug app mixing locally-compiled Fabric code with that core either
//    fails to link (pulling ExpoBlur's view drags ExpoFabricViewObjC.o in) or
//    - flavour-pinned to paper over the link - crashes at component
//    registration on the layout mismatch (SIGBUS in Props::Props). So the RN
//    CORE compiles from source (RCT_USE_PREBUILT_RNCORE=0) with the same flags
//    as everything else, and so do the Expo pods
//    (EXPO_USE_PRECOMPILED_MODULES off). The third-party C++ deps (folly,
//    glog...) STAY prebuilt - they carry no REACT_NATIVE_DEBUG flavour and are
//    most of a from-source build's cost. (The Podfile's own :ccache_enabled
//    wiring is NOT used: it drives every user-project target through
//    ccache-clang.sh at $(REACT_NATIVE_PATH), which the with-top-shelf
//    extension target does not define, and its link dies on the unresolved
//    path.)
//
// 2. The pods' SwiftUI code makes swiftc emit an AUTOLINK entry for
//    SwiftUICore (SwiftUI's split-out core), and ld obeys it when those static
//    objects link into the app - which is not an allowed client of it
//    ("cannot link directly with 'SwiftUICore'"; this ld predates
//    -ignore_auto_link_option, so the hint cannot be dropped at link time).
//    So the pods never emit the hint (-disable-autolink-framework) and the app
//    links the SwiftUI umbrella explicitly - it re-exports SwiftUICore's
//    symbols and apps ARE allowed clients of it.
//
// A config plugin rather than a hand-edit because clients/tv-native/ios is
// generated: `expo prebuild` rewrites the Podfile and Podfile.properties.json,
// and a hand-edit there is lost on the next run (which is how these fixes
// vanished the first time).

const {
  createRunOncePlugin,
  withDangerousMod,
  withPodfileProperties,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Idempotency marker; also where a reader of the Podfile is sent for the why.
const MARKER = '# tvOS + expo-blur link fixes (plugins/with-tv-blur-link.js)';

// Anchored on the template's one post_install call, after its closing paren.
// (A regex over `[^)]*` would stop inside the call's own nested parens.)
const ANCHOR = '    :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n';

// The env has to be forced before the React pods read it; the template's own
// `||=` defaults sit above this line and would otherwise win.
const ENV_ANCHOR = 'prepare_react_native_project!';
const ENV_ADDITIONS = `${MARKER}
ENV['RCT_USE_PREBUILT_RNCORE'] = '0'

`;

const POST_INSTALL_ADDITIONS = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        flags = config.build_settings['OTHER_SWIFT_FLAGS']
        flags = flags.is_a?(Array) ? flags.join(' ') : (flags || '$(inherited)')
        unless flags.include?('disable-autolink-framework')
          config.build_settings['OTHER_SWIFT_FLAGS'] =
            "#{flags} -Xfrontend -disable-autolink-framework -Xfrontend SwiftUICore"
        end
      end
    end
    installer.aggregate_targets.each do |aggregate|
      aggregate.user_project.targets.each do |target|
        target.build_configurations.each do |config|
          flags = config.build_settings['OTHER_LDFLAGS'] ||= ['$(inherited)']
          flags << '-framework' << 'SwiftUI' unless flags.include?('SwiftUI')
        end
      end
      aggregate.user_project.save
    end
`;

function withTvBlurLink(config) {
  config = withPodfileProperties(config, (config) => {
    // RN core + Expo pods from source, one set of compiler flags (fact 1).
    config.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false';
    return config;
  });
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');
      if (!src.includes(MARKER)) {
        if (!src.includes(ANCHOR) || !src.includes(ENV_ANCHOR)) {
          throw new Error(
            'with-tv-blur-link: could not find the Podfile anchors - the template changed, update the plugin.',
          );
        }
        fs.writeFileSync(
          podfile,
          src
            .replace(ENV_ANCHOR, `${ENV_ADDITIONS}${ENV_ANCHOR}`)
            .replace(ANCHOR, `${ANCHOR}${POST_INSTALL_ADDITIONS}`),
        );
      }
      return config;
    },
  ]);
}

module.exports = createRunOncePlugin(withTvBlurLink, 'with-tv-blur-link', '1.0.0');
