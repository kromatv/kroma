import ExpoModulesCore
import Foundation

/**
 * What a KROMA app can do to a television on its own network that a page
 * cannot: hold a WebSocket to a service that sits behind a certificate the
 * television signed for itself, and send a Wake-on-LAN packet.
 *
 * It knows no television. How each make is spoken to is written once, in
 * TypeScript, on top of these.
 *
 * On a real device Apple delivers a broadcast only to an app that holds the
 * multicast networking entitlement; without it the send succeeds and nothing
 * leaves, which is Apple's design.
 */
public class LanReachModule: Module {
  private let sockets = Sockets()

  public func definition() -> ModuleDefinition {
    Name("LanReach")

    AsyncFunction("open") { (url: String) async throws -> Int in
      guard let address = URL(string: url), LocalAddress.names(address.host) else {
        throw ReachError.badAddress
      }
      let socket = TrustingSocket(address)
      try await socket.open()
      return self.sockets.keep(socket)
    }

    AsyncFunction("send") { (socket: Int, text: String) async throws in
      try await self.sockets.find(socket).send(text)
    }

    AsyncFunction("receive") { (socket: Int, withinMs: Int) async throws -> String in
      try await self.sockets.find(socket).receive(within: withinMs)
    }

    AsyncFunction("close") { (socket: Int) in
      self.sockets.drop(socket)?.close()
    }

    AsyncFunction("magic") { (mac: String) in
      try MagicPacket(mac: mac).broadcast()
    }
  }
}

enum ReachError: Error {
  case badAddress
  case badHardwareAddress
  case noAnswer
  case noSocket
  case closed
}

/// A private or link-local IPv4 address, written in digits. A name is refused:
/// what it resolves to is not known before the connection is made.
enum LocalAddress {
  static func names(_ host: String?) -> Bool {
    let parts = (host ?? "").split(separator: ".", omittingEmptySubsequences: false).map { UInt8($0) }
    guard parts.count == 4, let first = parts[0], let second = parts[1], parts[2] != nil, parts[3] != nil
    else {
      return false
    }
    switch (first, second) {
    case (10, _), (192, 168), (169, 254), (172, 16...31):
      return true
    default:
      return false
    }
  }
}

/// The conversations that are open, by the handle JavaScript holds.
final class Sockets {
  private let lock = NSLock()
  private var open: [Int: TrustingSocket] = [:]
  private var last = 0

  func keep(_ socket: TrustingSocket) -> Int {
    lock.lock()
    defer { lock.unlock() }
    last += 1
    open[last] = socket
    return last
  }

  func find(_ handle: Int) throws -> TrustingSocket {
    lock.lock()
    defer { lock.unlock() }
    guard let socket = open[handle] else {
      throw ReachError.closed
    }
    return socket
  }

  func drop(_ handle: Int) -> TrustingSocket? {
    lock.lock()
    defer { lock.unlock() }
    return open.removeValue(forKey: handle)
  }
}

/// One WebSocket to a device on the local network.
///
/// A television signs its own certificate, for a name nobody can check, so
/// there is nothing to verify it against. So the module opens one to an
/// address on the local network and to no other: what travels is what the
/// television itself issued and a request to it.
final class TrustingSocket: NSObject, URLSessionWebSocketDelegate {
  private static let openWithin: TimeInterval = 4

  private let url: URL
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var opening: CheckedContinuation<Void, Error>?
  private let lock = NSLock()

  init(_ url: URL) {
    self.url = url
  }

  func open() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = Self.openWithin
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    let task = session.webSocketTask(with: url)
    self.session = session
    self.task = task
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      opening = continuation
      task.resume()
    }
  }

  func send(_ text: String) async throws {
    guard let task else {
      throw ReachError.closed
    }
    try await task.send(.string(text))
  }

  /// The next text frame. A conversation in which the device says nothing in
  /// time is over, so the socket is closed under the wait.
  func receive(within milliseconds: Int) async throws -> String {
    guard let task else {
      throw ReachError.closed
    }
    let deadline = Task {
      try await Task.sleep(nanoseconds: UInt64(milliseconds) * 1_000_000)
      self.close()
    }
    defer { deadline.cancel() }
    while true {
      guard let frame = try? await task.receive() else {
        throw ReachError.noAnswer
      }
      if case .string(let text) = frame {
        return text
      }
    }
  }

  func close() {
    task?.cancel(with: .normalClosure, reason: nil)
    session?.invalidateAndCancel()
  }

  func urlSession(
    _: URLSession,
    didReceive challenge: URLAuthenticationChallenge
  ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
    guard let trust = challenge.protectionSpace.serverTrust else {
      return (.performDefaultHandling, nil)
    }
    return (.useCredential, URLCredential(trust: trust))
  }

  func urlSession(
    _: URLSession,
    webSocketTask _: URLSessionWebSocketTask,
    didOpenWithProtocol _: String?
  ) {
    opened(.success(()))
  }

  func urlSession(_: URLSession, task _: URLSessionTask, didCompleteWithError _: Error?) {
    opened(.failure(ReachError.noAnswer))
  }

  // Whichever of the two delegate calls comes first answers `open`, once.
  private func opened(_ result: Result<Void, Error>) {
    lock.lock()
    let waiting = opening
    opening = nil
    lock.unlock()
    waiting?.resume(with: result)
  }
}

/// Six `ff` bytes, then the hardware address sixteen times.
struct MagicPacket {
  private static let port: UInt16 = 9
  private static let bursts = 3

  let bytes: [UInt8]

  init(mac: String) throws {
    let hex = mac.filter { $0 != ":" && $0 != "-" }
    guard hex.count == 12, let address = Self.bytes(of: hex) else {
      throw ReachError.badHardwareAddress
    }
    bytes = Array(repeating: 0xff, count: 6) + Array(repeating: address, count: 16).flatMap { $0 }
  }

  func broadcast() throws {
    let descriptor = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    guard descriptor >= 0 else {
      throw ReachError.noSocket
    }
    defer { close(descriptor) }
    var allow: Int32 = 1
    setsockopt(descriptor, SOL_SOCKET, SO_BROADCAST, &allow, socklen_t(MemoryLayout<Int32>.size))

    var everyone = sockaddr_in()
    everyone.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    everyone.sin_family = sa_family_t(AF_INET)
    everyone.sin_port = Self.port.bigEndian
    everyone.sin_addr.s_addr = INADDR_BROADCAST
    for _ in 0..<Self.bursts {
      send(to: everyone, over: descriptor)
    }
  }

  private func send(to address: sockaddr_in, over descriptor: Int32) {
    var address = address
    withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { generic in
        _ = sendto(descriptor, bytes, bytes.count, 0, generic, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
  }

  private static func bytes(of hex: String) -> [UInt8]? {
    var out: [UInt8] = []
    var rest = Substring(hex)
    while !rest.isEmpty {
      guard let byte = UInt8(rest.prefix(2), radix: 16) else {
        return nil
      }
      out.append(byte)
      rest = rest.dropFirst(2)
    }
    return out
  }
}
