import ExpoModulesCore
import Network

/**
 * Finding the server by ASKING the network, instead of guessing at it.
 *
 * See the Android half for the full story; the short version is that the server
 * has advertised `_kroma._tcp` (server/modules/tv.kroma.mdns) since forever and
 * nothing on this side ever listened, so the app fell back to sweeping the /24
 * on port 4040 - which cannot find a server behind a reverse proxy on 443 no
 * matter how long it looks.
 *
 * `NWBrowser` rather than `NetServiceBrowser`: the latter is deprecated, and the
 * former is what Apple supports on tvOS. The wrinkle is that a browse result is
 * an opaque `.service` endpoint, NOT a host and port - Bonjour deliberately
 * defers resolution - so each hit is resolved by opening a connection to it and
 * reading the path the system actually took.
 *
 * Browsing at all requires `NSBonjourServices` to list `_kroma._tcp` in
 * Info.plist. It already does (see app.json); without it this returns nothing
 * and says nothing about why.
 */
public class ServerDiscoveryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ServerDiscovery")

    AsyncFunction("browse") { (timeoutMs: Int, promise: Promise) in
      let window = min(max(Double(timeoutMs) / 1000.0, 0.25), 15.0)
      ServiceBrowse().run(timeout: window, promise: promise)
    }
  }
}

// One browse. Holds itself alive until it answers, then lets go.
private final class ServiceBrowse {
  private let queue = DispatchQueue(label: "tv.kroma.discovery")
  private var browser: NWBrowser?
  private var connections: [NWConnection] = []
  private var found: [[String: Any]] = []
  private var answered = false
  // The retain cycle is the point: nothing else holds this object, and it must
  // outlive the call that made it. Broken in `finish`.
  private var retainedSelf: ServiceBrowse?

  func run(timeout: TimeInterval, promise: Promise) {
    retainedSelf = self
    let descriptor = NWBrowser.Descriptor.bonjour(type: "_kroma._tcp", domain: nil)
    let browser = NWBrowser(for: descriptor, using: .tcp)
    self.browser = browser

    browser.browseResultsChangedHandler = { [weak self] results, _ in
      for result in results {
        guard case let .service(name, _, _, _) = result.endpoint else { continue }
        self?.resolve(endpoint: result.endpoint, name: name)
      }
    }
    browser.stateUpdateHandler = { [weak self] state in
      // A browser that cannot start (no local-network permission, no Bonjour
      // entry in Info.plist) must answer empty rather than hang for the window.
      if case .failed = state { self?.finish(promise) }
    }
    browser.start(queue: queue)
    queue.asyncAfter(deadline: .now() + timeout) { [weak self] in self?.finish(promise) }
  }

  // A Bonjour endpoint is a NAME, not an address. Opening a connection is what
  // makes the system do the resolution, and `currentPath.remoteEndpoint` is
  // where the answer lands.
  private func resolve(endpoint: NWEndpoint, name: String) {
    let connection = NWConnection(to: endpoint, using: .tcp)
    connections.append(connection)
    connection.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        if case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint {
          self.record(name: name, host: Self.plain(host), port: Int(port.rawValue))
        }
        connection.cancel()
      case .failed, .cancelled:
        connection.cancel()
      default:
        break
      }
    }
    connection.start(queue: queue)
  }

  // `fe80::1%en0` and a trailing dot are both real and both useless in a URL.
  private static func plain(_ host: NWEndpoint.Host) -> String {
    let text: String
    switch host {
    case let .name(name, _): text = name
    case let .ipv4(address): text = "\(address)"
    case let .ipv6(address): text = "\(address)"
    @unknown default: text = "\(host)"
    }
    let withoutZone = text.split(separator: "%").first.map(String.init) ?? text
    return withoutZone.hasSuffix(".") ? String(withoutZone.dropLast()) : withoutZone
  }

  private func record(name: String, host: String, port: Int) {
    guard !host.isEmpty, port > 0 else { return }
    if found.contains(where: { $0["host"] as? String == host && $0["port"] as? Int == port }) { return }
    found.append(["name": name, "host": host, "port": port])
  }

  private func finish(_ promise: Promise) {
    guard !answered else { return }
    answered = true
    browser?.cancel()
    for connection in connections { connection.cancel() }
    connections.removeAll()
    promise.resolve(found)
    retainedSelf = nil
  }
}
