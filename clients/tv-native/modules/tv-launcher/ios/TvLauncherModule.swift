import ExpoModulesCore
import Foundation

/**
 tvOS never lets an app write the home screen: a Top Shelf extension is asked
 for content on focus, so this only parks the JSON in the shared App Group.
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

// The three constants MUST match targets/top-shelf/ContentProvider.swift, and
// the group id plugins/with-top-shelf.js; the extension builds outside this pod.
enum TopShelfStore {
  static let appGroup = "group.tv.kroma"
  static let continueWatchingKey = "continueWatching"
  static let homeChannelKey = "homeChannel"

  static func write(_ json: String, forKey key: String) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      // Only when the App Group entitlement is missing; the home screen then
      // falls back to the static Top Shelf artwork.
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
