import ExpoModulesCore
import Foundation

/**
 The tvOS half of KROMA's launcher presence: the shortcut cards the Apple TV
 home screen shows above the app icon when it is focused in the top row
 (Top Shelf) - the platform's answer to the Android TV preview channels and
 the Tizen Smart Hub tiles.

 Unlike Android, tvOS never lets the app write to the home screen directly:
 the system asks a separate Top Shelf APP EXTENSION for content whenever the
 icon gains focus (see targets/top-shelf/ContentProvider.swift). The two
 processes share nothing but an App Group, so this module's whole job is the
 handoff - park the JSON payloads in the group's UserDefaults where the
 extension will find them at query time. No push, no notification: the
 extension reads whatever is current when the system asks.

 The payloads stay the raw JSON strings the JS side sends (same wire format
 the Android module parses); the extension does the parsing. Best effort,
 like the Android half: a write that fails must cost a log line, never a
 frame.
 */
public class TvLauncherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TvLauncher")

    Function("setContinueWatching") { (json: String) in
      TopShelfStore.write(json, forKey: TopShelfStore.continueWatchingKey)
    }

    Function("setHomeChannel") { (json: String) in
      TopShelfStore.write(json, forKey: TopShelfStore.homeChannelKey)
    }

    Function("clear") {
      TopShelfStore.clear()
    }
  }
}

/**
 The app's side of the App Group mailbox.

 The three string constants MUST match the Top Shelf extension
 (targets/top-shelf/ContentProvider.swift) and the group id also appears in
 plugins/with-top-shelf.js, which entitles both targets to it. They are
 duplicated rather than shared because the extension is compiled into its own
 target by the prebuild plugin, outside this pod.
 */
enum TopShelfStore {
  static let appGroup = "group.tv.kroma"
  static let continueWatchingKey = "continueWatching"
  static let homeChannelKey = "homeChannel"

  static func write(_ json: String, forKey key: String) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      // Only possible when the App Group entitlement is missing (the
      // with-top-shelf plugin was removed or renamed the group): the home
      // screen quietly falls back to the static Top Shelf artwork.
      NSLog("[KromaTvLauncher] app group \(appGroup) unavailable, top shelf not updated")
      return
    }
    defaults.set(json, forKey: key)
  }

  static func clear() {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    defaults.removeObject(forKey: continueWatchingKey)
    defaults.removeObject(forKey: homeChannelKey)
  }
}
