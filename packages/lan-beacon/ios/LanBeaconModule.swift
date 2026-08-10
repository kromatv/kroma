import ExpoModulesCore
import Network

/**
 * Publishing "this television is waiting for an account" on the link, and
 * hearing it from a telephone in the same room.
 *
 * Why the link at all, when the server already brokers this: because a
 * link-local multicast does not cross a router, so hearing one is proof of
 * being in the room. The server can only compare the two devices' addresses,
 * which it loses to NAT, to a routed house, and to a dual-stack one where the
 * television arrives over IPv6 and the telephone over IPv4. What is published
 * here carries a proof string the server will take instead.
 *
 * The browse deliberately does NOT resolve. `NWBrowser` hands back the TXT
 * record in the result's metadata, and TXT is the entire payload: there is no
 * host to connect to and no port that means anything. The server-discovery
 * module beside this one has to resolve because it wants an address; this one
 * must not, because resolving would be a connection attempt per television for
 * nothing.
 *
 * Browsing at all requires `NSBonjourServices` to list `_kroma-tv._tcp` in
 * Info.plist, and publishing requires `NSLocalNetworkUsageDescription`. Both
 * are in app.json for the two apps that use this. Without them this stays
 * silent and says nothing about why, which is Apple's design, not ours.
 */
public class LanBeaconModule: Module {
  private let state = BeaconState()

  public func definition() -> ModuleDefinition {
    Name("LanBeacon")
    Events("lan-beacon:found")

    Function("publish") { (name: String, txt: [String: String]) in
      self.state.publish(name: name, txt: txt)
    }

    Function("unpublish") {
      self.state.unpublish()
    }

    Function("startBrowse") { (epoch: Int) in
      self.state.startBrowse { services in
        self.sendEvent("lan-beacon:found", ["services": services, "epoch": epoch])
      }
    }

    Function("stopBrowse") {
      self.state.stopBrowse()
    }

    OnDestroy {
      self.state.unpublish()
      self.state.stopBrowse()
    }
  }
}

// Everything with a lifetime, kept off the module so a reload cannot strand a
// listener still holding the port. Every field below is confined to `queue`:
// the module's `Function`s run on the JavaScript actor while Network.framework
// calls its handlers back on `queue`, so the entry points hop rather than share.
private final class BeaconState {
  private let queue = DispatchQueue(label: "tv.kroma.lan-beacon")
  private var listener: NWListener?
  private var browser: NWBrowser?
  private var advertised: (name: String, txt: [String: String])?
  private var retries = 0
  private var generation = 0

  private static let serviceType = "_kroma-tv._tcp"
  // A television is the one device nobody is holding, so a beacon that dies
  // silently is a beacon nobody notices. Rebuild a few times, backing off.
  private static let maxRetries = 4

  func publish(name: String, txt: [String: String]) {
    queue.async { self.advertise(name: name, txt: txt) }
  }

  func unpublish() {
    queue.async { self.withdraw() }
  }

  func startBrowse(_ onFound: @escaping ([[String: Any]]) -> Void) {
    queue.async { self.beginBrowse(onFound) }
  }

  func stopBrowse() {
    queue.async { self.endBrowse() }
  }

  private func advertise(name: String, txt: [String: String]) {
    withdraw()
    advertised = (name, txt)
    start(name: name, txt: txt, generation: generation)
  }

  private func withdraw() {
    generation &+= 1
    advertised = nil
    retries = 0
    listener?.cancel()
    listener = nil
  }

  private func start(name: String, txt: [String: String], generation: Int) {
    var record = NWTXTRecord()
    for (key, value) in txt {
      record[key] = value
    }
    // A DNS-SD advertisement needs a port, so the listener takes an ephemeral
    // one. Nothing ever connects to it: the record IS the message, and the
    // grant it leads to travels to the server over ordinary HTTP.
    guard let listener = try? NWListener(using: .tcp) else { return }
    listener.service = NWListener.Service(name: name, type: Self.serviceType, txtRecord: record)
    // A connection here is nobody we know. Accepting and immediately cancelling
    // keeps the listener healthy; leaving them pending would stall it.
    listener.newConnectionHandler = { connection in connection.cancel() }
    // Without this the publisher is the one half of the module that cannot
    // fail out loud: a refused Local Network permission parks the listener in
    // `.waiting` forever and the television advertises nothing, looking for all
    // the world like a set that simply is not there. `.waiting` recovers on its
    // own once permission is granted; `.failed` is documented as terminal, so
    // the listener has to be built again rather than restarted.
    listener.stateUpdateHandler = { [weak self] state in
      guard case .failed = state else { return }
      self?.rebuild(generation: generation)
    }
    self.listener?.cancel()
    self.listener = listener
    listener.start(queue: queue)
  }

  private func rebuild(generation: Int) {
    // The record can be replaced or withdrawn while this backs off, and
    // re-advertising a spent one hands every phone that taps it a dead handle.
    guard generation == self.generation, advertised != nil, retries < Self.maxRetries
    else { return }
    retries += 1
    listener?.cancel()
    listener = nil
    queue.asyncAfter(deadline: .now() + .seconds(1 << (retries - 1))) { [weak self] in
      guard let self, generation == self.generation, let record = self.advertised else { return }
      self.start(name: record.name, txt: record.txt, generation: generation)
    }
  }

  private func beginBrowse(_ onFound: @escaping ([[String: Any]]) -> Void) {
    endBrowse()
    // `bonjourWithTXTRecord`, NOT `bonjour`: the plain descriptor browses without
    // asking for text records, so every result arrives with `.none` metadata and
    // the whole payload is missing. The names differ by one word and the failure
    // is silent, which is worth the sentence.
    let descriptor = NWBrowser.Descriptor.bonjourWithTXTRecord(type: Self.serviceType, domain: nil)
    // `includePeerToPeer` stays off: this is about the room's network, and AWDL
    // would let a device that is on no network of ours appear in the list.
    let browser = NWBrowser(for: descriptor, using: .tcp)

    browser.browseResultsChangedHandler = { results, _ in
      onFound(results.compactMap(Self.describe))
    }
    browser.stateUpdateHandler = { [weak self] state in
      switch state {
      // What a refused Local Network prompt actually looks like. `.failed` is
      // the missing-Info.plist case, which these builds cannot hit (both apps
      // declare the type), so handling only that one meant handling the case
      // that never happens and ignoring the one that does.
      case .waiting:
        onFound([])
      // Documented as unrecoverable: the browser must be rebuilt, not restarted.
      // Nothing here rebuilds it, so at least stop pretending it is alive and
      // say the link is empty.
      case .failed:
        onFound([])
        self?.endBrowse()
      default:
        break
      }
    }
    self.browser = browser
    browser.start(queue: queue)
  }

  private func endBrowse() {
    browser?.cancel()
    browser = nil
  }

  // A result with no text record is not one of ours, whatever it is called.
  private static func describe(_ result: NWBrowser.Result) -> [String: Any]? {
    guard case let .service(name, _, _, _) = result.endpoint,
          case let .bonjour(record) = result.metadata
    else { return nil }
    var txt: [String: String] = [:]
    for (key, value) in record.dictionary {
      txt[key] = value
    }
    if txt.isEmpty { return nil }
    return ["name": name, "txt": txt]
  }
}
