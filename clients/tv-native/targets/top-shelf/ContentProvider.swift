import Foundation
import TVServices

/**
 The Apple TV Top Shelf extension, compiled into its own target by
 plugins/with-top-shelf.js. The system queries it out-of-process on every focus;
 the cards come from the App Group UserDefaults the app writes.
 */
final class ContentProvider: TVTopShelfContentProvider {
  override func loadTopShelfContent(completionHandler: @escaping (TVTopShelfContent?) -> Void) {
    completionHandler(TopShelf.content())
  }
}

enum TopShelf {
  // Must match the tv-launcher module's TopShelfStore and the group id in
  // plugins/with-top-shelf.js; duplicated because this target is outside its pod.
  static let appGroup = "group.tv.kroma"
  static let continueWatchingKey = "continueWatching"
  static let homeChannelKey = "homeChannel"

  static let maxItems = 20

  static func content() -> TVTopShelfContent? {
    let defaults = UserDefaults(suiteName: appGroup)
    var sections: [TVTopShelfItemCollection<TVTopShelfSectionedItem>] = []

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

    // The home rows arrive already ordered and localized by the server.
    for channel in rows(defaults?.string(forKey: homeChannelKey)) {
      let items = (channel["items"] as? [[String: Any]] ?? [])
        .prefix(maxItems)
        .compactMap(item(of:))
      guard !items.isEmpty else { continue }
      let section = TVTopShelfItemCollection(items: Array(items))
      section.title = channel["title"] as? String
      sections.append(section)
    }

    // nil, not empty content: it makes the system fall back to the static Top Shelf
    // artwork instead of rendering a blank shelf.
    guard !sections.isEmpty else { return nil }
    return TVTopShelfSectionedContent(sections: sections)
  }

  private static func item(of row: [String: Any]) -> TVTopShelfSectionedItem? {
    guard let id = row["id"] as? String, !id.isEmpty else { return nil }
    let item = TVTopShelfSectionedItem(identifier: id)
    item.title = row["title"] as? String
    item.imageShape = .hdtv
    if let url = artURL(of: row) {
      item.setImageURL(url, for: [.screenScale1x, .screenScale2x])
    }
    // An episode's card links to its show: the app cannot resolve an episode id
    // (see launcher-links.ts), only the show detail can.
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

  // The server's composited card, re-requested at 1280×720 (its cards render nearly
  // full-width on a 4K shelf) with the baked-in `progress` bar stripped, since the
  // shelf draws its own from `playbackProgress`.
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

  // Localized in code so the target stays resource-free: the prebuild plugin only
  // has to compile one file.
  private static var continueTitle: String {
    Locale.preferredLanguages.first?.lowercased().hasPrefix("fr") == true
      ? "Reprendre" : "Continue Watching"
  }

  private static func rows(_ json: String?) -> [[String: Any]] {
    guard let data = json?.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return parsed
  }
}

extension CharacterSet {
  // `urlPathAllowed` minus the separators an item id must not smuggle into
  // `kroma://item/<id>` (launcher-links.ts stops the id at `/ ? #`).
  static let urlPathAllowedStrict = CharacterSet.urlPathAllowed
    .subtracting(CharacterSet(charactersIn: "/?#"))
}
