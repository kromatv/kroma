import ExpoModulesCore
import Foundation

/**
 * What a KROMA app does to a television on its own network that HTTP cannot.
 *
 * A Samsung set in standby keeps its network on and takes remote keys over its
 * own remote service, a WebSocket on port 8002. That is how it is switched on:
 * it does not wake for a Wake-on-LAN packet on Wi-Fi. The service sits behind
 * a certificate the set signed for itself, which is why a browser cannot open
 * it and an app has to.
 *
 * The packet is here for every other set. On a real device Apple delivers a
 * broadcast only to an app that holds the multicast networking entitlement;
 * without it the send succeeds and nothing leaves, which is Apple's design.
 */
public class LanReachModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LanReach")

    AsyncFunction("samsungKey") { (address: String, key: String, token: String?) async throws -> String? in
      try await SamsungRemote(address: address, token: token).press(key)
    }

    AsyncFunction("magic") { (mac: String) in
      try MagicPacket(mac: mac).broadcast()
    }
  }
}

enum ReachError: Error {
  case badAddress
  case badHardwareAddress
  case refused
  case noAnswer
  case noSocket
}

/// One connection to a set's remote service: it waits for the set's welcome,
/// presses one key, and goes.
final class SamsungRemote: NSObject, URLSessionDelegate {
  private static let name = Data("KROMA".utf8).base64EncodedString()
  // Long enough for somebody to pick up the remote and accept the prompt the
  // set shows the first time; a set that already gave a token answers at once.
  private static let pairWithin: TimeInterval = 60
  private static let answerWithin: TimeInterval = 8
  private static let keyLanding: UInt64 = 600_000_000

  private let url: URL
  private let welcomeWithin: TimeInterval

  init(address: String, token: String?) throws {
    var parts = URLComponents()
    parts.scheme = "wss"
    parts.host = address
    parts.port = 8002
    parts.path = "/api/v2/channels/samsung.remote.control"
    parts.queryItems = [URLQueryItem(name: "name", value: Self.name)]
    if let token, !token.isEmpty {
      parts.queryItems?.append(URLQueryItem(name: "token", value: token))
    }
    guard let url = parts.url else {
      throw ReachError.badAddress
    }
    self.url = url
    self.welcomeWithin = token == nil ? Self.pairWithin : Self.answerWithin
  }

  /// Presses `key` and answers the token the set welcomed this connection
  /// with, which is what it wants sent back the next time.
  func press(_ key: String) async throws -> String? {
    let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    defer { session.invalidateAndCancel() }
    let socket = session.webSocketTask(with: url)
    socket.resume()

    let token = try await welcome(on: socket)
    try await socket.send(.string(Self.frame(pressing: key)))
    // The set drops a key it is still reading when the socket closes under it.
    try await Task.sleep(nanoseconds: Self.keyLanding)
    socket.cancel(with: .normalClosure, reason: nil)
    return token
  }

  // The set signs its own certificate, for a name nobody can check, so there
  // is nothing to verify it against. What travels is a token the set issued
  // and a remote key, to an address on the network the person is on.
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge
  ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
    guard let trust = challenge.protectionSpace.serverTrust else {
      return (.performDefaultHandling, nil)
    }
    return (.useCredential, URLCredential(trust: trust))
  }

  private func welcome(on socket: URLSessionWebSocketTask) async throws -> String? {
    let deadline = Task {
      try await Task.sleep(nanoseconds: UInt64(welcomeWithin * 1_000_000_000))
      socket.cancel(with: .goingAway, reason: nil)
    }
    defer { deadline.cancel() }
    do {
      return try await firstGreeting(on: socket)
    } catch ReachError.refused {
      throw ReachError.refused
    } catch {
      throw ReachError.noAnswer
    }
  }

  private func firstGreeting(on socket: URLSessionWebSocketTask) async throws -> String? {
    while true {
      guard case .string(let text) = try await socket.receive() else {
        continue
      }
      switch Greeting(text) {
      case .welcome(let token):
        return token
      case .refused:
        throw ReachError.refused
      case .other:
        continue
      }
    }
  }

  private static func frame(pressing key: String) throws -> String {
    let frame: [String: Any] = [
      "method": "ms.remote.control",
      "params": [
        "Cmd": "Click",
        "DataOfCmd": key,
        "Option": "false",
        "TypeOfRemote": "SendRemoteKey",
      ],
    ]
    let data = try JSONSerialization.data(withJSONObject: frame)
    return String(decoding: data, as: UTF8.self)
  }
}

/// What a frame from the set means for a connection that is being opened.
enum Greeting {
  case welcome(token: String?)
  case refused
  case other

  init(_ text: String) {
    guard
      let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)),
      let frame = object as? [String: Any],
      let event = frame["event"] as? String
    else {
      self = .other
      return
    }
    switch event {
    case "ms.channel.connect":
      self = .welcome(token: Self.token(in: frame["data"]))
    case "ms.channel.unauthorized", "ms.channel.timeOut":
      self = .refused
    default:
      self = .other
    }
  }

  // A set sends the token as a string on one firmware and as a number on another.
  private static func token(in data: Any?) -> String? {
    guard let fields = data as? [String: Any] else {
      return nil
    }
    if let text = fields["token"] as? String, !text.isEmpty {
      return text
    }
    if let number = fields["token"] as? NSNumber {
      return number.stringValue
    }
    return nil
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
