import Foundation
import TVServices

/**
 KROMA's Top Shelf: the shortcut cards the Apple TV home screen shows above
 the app icon while it is focused in the top row - the tvOS answer to the
 Android TV preview channels and the Tizen Smart Hub tiles.

 This file is the whole extension. It is not part of the app: the system runs
 it as a separate process and queries it every time the icon gains focus, so
 there is no push and no lifecycle to manage - just "what should the shelf
 show right now". The answer comes from the App Group's UserDefaults, where
 the app parks its continue-watching and home-section lists as the same JSON
 strings the Android launcher module consumes (see the tv-launcher module's
 TvLauncherModule.swift, which writes them, and packages/tv's launcher.ts for
 the wire format). Sign-out clears the keys, so a signed-out box falls back
 to the static Top Shelf artwork automatically.

 The prebuild plugin (plugins/with-top-shelf.js) compiles this into the
 KromaTopShelf extension target and entitles both targets to the group.

 Every card deep-links back via `kroma://item/<id>` - the exact URL the
 Android launcher rows use - so selection lands in the app through `Linking`
 and src/lib/launcher-links.ts, whether the app was running or not.
 */
final class ContentProvider: TVTopShelfContentProvider {
  override func loadTopShelfContent(completionHandler: @escaping (TVTopShelfContent?) -> Void) {
    completionHandler(TopShelf.content())
  }
}

enum TopShelf {
  /// MUST match the tv-launcher module's TopShelfStore and the group id in
  /// plugins/with-top-shelf.js. Duplicated because this file is compiled into
  /// its own target, outside the module's pod.
  static let appGroup = "group.tv.kroma"
  static let continueWatchingKey = "continueWatching"
  static let homeChannelKey = "homeChannel"

  /// Per-section cap, mirroring the Android module's MAX_PROGRAMS: the shelf
  /// shows a handful and scrolls; a runaway list should not cost the render.
  static let maxItems = 20

  static func content() -> TVTopShelfContent? {
    let defaults = UserDefaults(suiteName: appGroup)
    var sections: [TVTopShelfItemCollection<TVTopShelfSectionedItem>] = []

    // "Continue watching" first, like every launcher: `[{id,title,subtitle?,
    // imageUrl?,progressMs,durationMs,kind,updatedAtMs}]`.
    let continueRows = rows(defaults?.string(forKey: continueWatchingKey))
    let continueItems = continueRows.prefix(maxItems).compactMap { row -> TVTopShelfSectionedItem? in
      guard let item = item(of: row) else { return nil }
      let duration = row["durationMs"] as? Double ?? 0
      let progress = row["progressMs"] as? Double ?? 0
      if duration > 0 {
        item.playbackProgress = min(max(progress / duration, 0), 1)
      }
      return item
    }
    if !continueItems.isEmpty {
      let section = TVTopShelfItemCollection(items: Array(continueItems))
      section.title = continueTitle
      sections.append(section)
    }

    // Then the named home rows: `[{title, items:[{id,title,subtitle?,
    // imageUrl?,kind}]}]`, already ordered and localized by the server.
    for channel in rows(defaults?.string(forKey: homeChannelKey)) {
      let items = (channel["items"] as? [[String: Any]] ?? [])
        .prefix(maxItems)
        .compactMap(item(of:))
      guard !items.isEmpty else { continue }
      let section = TVTopShelfItemCollection(items: Array(items))
      section.title = channel["title"] as? String
      sections.append(section)
    }

    // nil, not an empty content object: it tells the system to fall back to
    // the static Top Shelf artwork instead of rendering a blank shelf.
    guard !sections.isEmpty else { return nil }
    return TVTopShelfSectionedContent(sections: sections)
  }

  /// One card. Art prefers `backdropUrl` - the clean full-size backdrop -
  /// because the shelf draws its own title and progress bar, and the
  /// composited 640×360 vignette both duplicates that chrome and upscales
  /// badly on a 4K shelf. 16:9 either way, hence `.hdtv`; both URLs are
  /// public, the system fetches and caches itself.
  private static func item(of row: [String: Any]) -> TVTopShelfSectionedItem? {
    guard let id = row["id"] as? String, !id.isEmpty else { return nil }
    let item = TVTopShelfSectionedItem(identifier: id)
    item.title = row["title"] as? String
    item.imageShape = .hdtv
    if let url = artURL(of: row) {
      item.setImageURL(url, for: [.screenScale1x, .screenScale2x])
    }
    // An episode's card links to its SHOW: the app's movie catalogue cannot
    // resolve an episode id (see launcher-links.ts), the show detail can.
    let showId = row["showId"] as? String
    let target: String? =
      if row["kind"] as? String == "episode", let showId, !showId.isEmpty {
        encoded(showId).map { "kroma://show/\($0)" }
      } else {
        encoded(id).map { "kroma://item/\($0)" }
      }
    if let target, let link = URL(string: target) {
      item.displayAction = TVTopShelfAction(url: link)
      item.playAction = TVTopShelfAction(url: link)
    }
    return item
  }

  private static func encoded(_ id: String) -> String? {
    id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowedStrict)
  }

  /// The art for one row: the server's composited card - the same
  /// backdrop + title-logo vignette the Tizen and Android launchers show -
  /// re-requested at the 1280×720 rendition (`w=1280`) and with the baked
  /// `progress` bar stripped, because the shelf draws its own beneath the
  /// card (`playbackProgress`) and its cards render nearly full-width on a
  /// 4K screen. Items with no card fall back to the raw backdrop.
  private static func artURL(of row: [String: Any]) -> URL? {
    if let card = row["imageUrl"] as? String, var parts = URLComponents(string: card) {
      var query = (parts.queryItems ?? []).filter { $0.name != "progress" && $0.name != "w" }
      query.append(URLQueryItem(name: "w", value: "1280"))
      parts.queryItems = query
      if let url = parts.url { return url }
    }
    if let backdrop = row["backdropUrl"] as? String, let url = URL(string: backdrop) {
      return url
    }
    return nil
  }

  /// The lone user-facing string this target owns, localized in code so the
  /// target stays resource-free (the prebuild plugin only has to compile one
  /// file). en + fr, matching the app's CFBundleLocalizations; the home-row
  /// titles arrive already localized by the server.
  private static var continueTitle: String {
    Locale.preferredLanguages.first?.lowercased().hasPrefix("fr") == true
      ? "Reprendre" : "Continue Watching"
  }

  /// A stored JSON array payload, or [] for absent/bad data - a shelf that
  /// cannot parse must fall back, never crash the provider.
  private static func rows(_ json: String?) -> [[String: Any]] {
    guard let data = json?.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return parsed
  }
}

extension CharacterSet {
  /// `urlPathAllowed` minus the separators an item id must not smuggle into
  /// `kroma://item/<id>` (launcher-links.ts stops the id at `/ ? #`).
  static let urlPathAllowedStrict = CharacterSet.urlPathAllowed
    .subtracting(CharacterSet(charactersIn: "/?#"))
}
