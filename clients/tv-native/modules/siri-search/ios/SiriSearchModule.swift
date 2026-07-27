import ExpoModulesCore

/**
 * The JavaScript face of Siri's media intents (see KromaMediaIntents.swift for
 * what Siri hands us, and why there is no Intents extension).
 *
 * Two ways in, because a Siri request lands on either side of the app being
 * alive: `takePendingQuery()` for the cold launch Siri itself triggered, and a
 * `query` event for the app that was already on screen.
 */
public class SiriSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SiriSearch")

    Events("query")

    OnStartObserving {
      SiriSearchBridge.shared.onQuery = { [weak self] query in
        self?.sendEvent("query", ["text": query])
      }
    }

    OnStopObserving {
      SiriSearchBridge.shared.onQuery = nil
    }

    /// The query Siri left before JavaScript was running, or nil. Reading it
    /// clears it, so a later relaunch never replays an old request.
    Function("takePendingQuery") {
      SiriSearchBridge.shared.take()
    }
  }
}
