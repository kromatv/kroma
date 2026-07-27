import Foundation
import Intents

/**
 * Siri, on Apple TV.
 *
 * The Siri Remote's microphone is the system's and no app may open it, so this
 * is the only voice KROMA can ever have on tvOS: the user talks to Siri, Siri
 * hands us what was asked for. "Cherche Blade Runner dans KROMA" arrives as an
 * `INSearchForMediaIntent`, "Joue Blade Runner dans KROMA" as an
 * `INPlayMediaIntent`, and both carry the spoken title in their `INMediaSearch`.
 *
 * There is deliberately no Intents app EXTENSION. Since iOS/tvOS 14 the app
 * itself can answer, through `application(_:handlerFor:)`, which is what the
 * config plugin wires into the generated AppDelegate. An extension would be a
 * second process that has to be given the server URL and a session token to
 * resolve anything - all of that to answer a question the app can answer once it
 * is open. So neither intent resolves media here: both reply `continueInApp`,
 * the system brings KROMA forward, and the app searches its own catalogue with
 * its own session, showing what it found.
 */
@objc public final class KromaMediaIntents: NSObject {
  @objc public static let shared = KromaMediaIntents()

  /// The handler for a media intent, or nil for anything not ours. This is what
  /// the app delegate returns from `application(_:handlerFor:)`.
  @objc public static func handler(for intent: INIntent) -> Any? {
    (intent is INSearchForMediaIntent || intent is INPlayMediaIntent) ? shared : nil
  }

  /// What the user actually said to search for. `mediaName` is the title; the
  /// others cover "joue quelque chose de Villeneuve" style requests, where a
  /// name-less search still describes something our full-text index can find.
  static func spokenQuery(_ search: INMediaSearch?) -> String? {
    guard let search else { return nil }
    let candidates = [
      search.mediaName,
      search.artistName,
      search.albumName,
      search.genreNames?.first,
    ]
    return candidates.compactMap { $0 }.first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
  }
}

extension KromaMediaIntents: INSearchForMediaIntentHandling {
  public func handle(
    intent: INSearchForMediaIntent,
    completion: @escaping (INSearchForMediaIntentResponse) -> Void
  ) {
    guard let query = Self.spokenQuery(intent.mediaSearch) else {
      completion(INSearchForMediaIntentResponse(code: .failure, userActivity: nil))
      return
    }
    SiriSearchBridge.shared.deliver(query)
    completion(INSearchForMediaIntentResponse(code: .continueInApp, userActivity: nil))
  }
}

extension KromaMediaIntents: INPlayMediaIntentHandling {
  public func handle(
    intent: INPlayMediaIntent,
    completion: @escaping (INPlayMediaIntentResponse) -> Void
  ) {
    // A play request names a title too, and the honest answer to "play X" from a
    // library that may not have X is to open on what we DO have for those words.
    guard let query = Self.spokenQuery(intent.mediaSearch) else {
      completion(INPlayMediaIntentResponse(code: .failure, userActivity: nil))
      return
    }
    SiriSearchBridge.shared.deliver(query)
    completion(INPlayMediaIntentResponse(code: .continueInApp, userActivity: nil))
  }
}

/**
 * The one-word channel from Siri to JavaScript.
 *
 * Timing is the whole reason this exists: Siri routinely LAUNCHES the app to
 * handle an intent, so the query is known while there is no React tree, no
 * JavaScript, nothing to send an event to. So a query is kept until someone
 * takes it, and also pushed live for the case where the app was already open.
 */
public final class SiriSearchBridge {
  public static let shared = SiriSearchBridge()

  private let lock = NSLock()
  private var pending: String?
  /// Set while JavaScript is listening (the module's observers).
  var onQuery: ((String) -> Void)?

  func deliver(_ query: String) {
    lock.lock()
    pending = query
    let notify = onQuery
    lock.unlock()
    // Siri calls in on its own queue; the module sends its event from the main
    // one like every other native event in the app.
    DispatchQueue.main.async { notify?(query) }
  }

  /// The query Siri left, once. Taking it is what clears it.
  func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let query = pending
    pending = nil
    return query
  }
}
