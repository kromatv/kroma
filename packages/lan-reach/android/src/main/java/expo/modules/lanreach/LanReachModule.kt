package expo.modules.lanreach

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class Closed : Exception("The conversation is closed")

/**
 * What a KROMA app can do to a television on its own network that a page
 * cannot: hold a WebSocket to a service that sits behind a certificate the
 * television signed for itself, and send a Wake-on-LAN packet.
 *
 * It knows no television. How each make is spoken to is written once, in
 * TypeScript, on top of these.
 */
class LanReachModule : Module() {
  private val sockets = ConcurrentHashMap<Int, TrustingSocket>()
  private val last = AtomicInteger()

  override fun definition() = ModuleDefinition {
    Name("LanReach")

    AsyncFunction("open") { url: String ->
      val socket = TrustingSocket(url).apply { open() }
      last.incrementAndGet().also { sockets[it] = socket }
    }

    AsyncFunction("send") { socket: Int, text: String -> find(socket).send(text) }

    AsyncFunction("receive") { socket: Int, withinMs: Int -> find(socket).receive(withinMs) }

    AsyncFunction("close") { socket: Int -> sockets.remove(socket)?.close() }

    AsyncFunction("magic") { mac: String -> MagicPacket(mac).broadcast() }
  }

  private fun find(socket: Int): TrustingSocket = sockets[socket] ?: throw Closed()
}
