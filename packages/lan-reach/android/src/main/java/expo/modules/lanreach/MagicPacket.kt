package expo.modules.lanreach

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

private const val PORT = 9
private const val BURSTS = 3
private const val HARDWARE_BYTES = 6

class BadHardwareAddress : Exception("Not a hardware address")

/** Six `ff` bytes, then the hardware address sixteen times. */
class MagicPacket(mac: String) {
  val bytes: ByteArray

  init {
    val hex = mac.filter { it != ':' && it != '-' }
    val address = hex.chunked(2).map { it.toIntOrNull(16)?.toByte() }
    if (hex.length != HARDWARE_BYTES * 2 || address.any { it == null }) {
      throw BadHardwareAddress()
    }
    bytes = ByteArray(HARDWARE_BYTES) { 0xff.toByte() } +
      List(16) { address.filterNotNull() }.flatten().toByteArray()
  }

  fun broadcast() {
    DatagramSocket().use { socket ->
      socket.broadcast = true
      val everyone = InetAddress.getByName("255.255.255.255")
      repeat(BURSTS) { socket.send(DatagramPacket(bytes, bytes.size, everyone, PORT)) }
    }
  }
}
