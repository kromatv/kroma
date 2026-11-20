package expo.modules.lanreach

import java.io.DataInputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

private const val OPEN_WITHIN_MS = 4_000

class NoAnswer : Exception("The device did not answer")

class NotOnThisNetwork : Exception("Not an address on the local network")

// A private or link-local IPv4 address, written in digits. A name is refused:
// what it resolves to is not known before the connection is made.
internal fun onLocalNetwork(host: String?): Boolean {
  val parts = host.orEmpty().split(".").map { it.toIntOrNull()?.takeIf { part -> part in 0..255 } }
  if (parts.size != 4 || parts.any { it == null }) {
    return false
  }
  val (first, second) = parts.filterNotNull()
  return first == 10 ||
    (first == 192 && second == 168) ||
    (first == 169 && second == 254) ||
    (first == 172 && second in 16..31)
}

/**
 * One WebSocket to a device on the local network.
 *
 * A television signs its own certificate, for a name nobody can check, so
 * there is nothing to verify it against. So the socket opens to an address on
 * the local network and to no other: what travels is what the television
 * itself issued and a request to it. The few frames a conversation in text needs are written here by hand
 * (RFC 6455), so the module brings no library.
 */
class TrustingSocket(url: String) {
  private val address = URI(url)
  private val socket: Socket =
    if (address.scheme == "wss") trusting.socketFactory.createSocket() else Socket()
  private lateinit var input: DataInputStream
  private lateinit var output: OutputStream

  fun open() {
    if (!onLocalNetwork(address.host)) {
      throw NotOnThisNetwork()
    }
    try {
      socket.connect(InetSocketAddress(address.host, address.port), OPEN_WITHIN_MS)
      socket.soTimeout = OPEN_WITHIN_MS
      (socket as? SSLSocket)?.startHandshake()
      input = DataInputStream(socket.getInputStream())
      output = socket.getOutputStream()
      upgrade()
    } catch (e: Exception) {
      close()
      throw NoAnswer()
    }
  }

  fun send(text: String) = write(TEXT, text.toByteArray())

  /**
   * The next text frame. A conversation in which the device says nothing in
   * time is over, so the socket is closed.
   */
  fun receive(withinMs: Int): String {
    try {
      socket.soTimeout = withinMs
      while (true) {
        val opcode = input.readUnsignedByte() and 0x0f
        val payload = ByteArray(length()).also(input::readFully)
        if (opcode == TEXT) {
          return String(payload)
        }
      }
    } catch (e: Exception) {
      close()
      throw NoAnswer()
    }
  }

  fun close() {
    runCatching { write(CLOSE, ByteArray(0)) }
    runCatching { socket.close() }
  }

  private fun upgrade() {
    val path = address.rawPath.ifEmpty { "/" } + (address.rawQuery?.let { "?$it" } ?: "")
    val request = listOf(
      "GET $path HTTP/1.1",
      "Host: ${address.host}:${address.port}",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: ${nonce()}",
      "Sec-WebSocket-Version: 13",
    )
    output.write((request.joinToString("\r\n") + "\r\n\r\n").toByteArray())
    output.flush()
    if (!status().contains(" 101 ")) {
      throw NoAnswer()
    }
  }

  // The status line of the answer, with its headers read and dropped.
  private fun status(): String {
    val head = StringBuilder()
    while (!head.endsWith("\r\n\r\n")) {
      head.append(input.readUnsignedByte().toChar())
    }
    return head.lineSequence().first()
  }

  private fun length(): Int =
    when (val short = input.readUnsignedByte() and 0x7f) {
      TWO_BYTES -> input.readUnsignedShort()
      in 0..SHORT_MAX -> short
      else -> input.readLong().toInt()
    }

  // A client masks what it sends; the device does not.
  @Synchronized
  private fun write(opcode: Int, payload: ByteArray) {
    val mask = ByteArray(4).also(SecureRandom()::nextBytes)
    output.write(FINAL or opcode)
    if (payload.size <= SHORT_MAX) {
      output.write(MASKED or payload.size)
    } else {
      output.write(MASKED or TWO_BYTES)
      output.write(payload.size shr 8)
      output.write(payload.size and 0xff)
    }
    output.write(mask)
    output.write(ByteArray(payload.size) { (payload[it].toInt() xor mask[it % 4].toInt()).toByte() })
    output.flush()
  }

  private companion object {
    val trusting: SSLContext =
      SSLContext.getInstance("TLSv1.2").apply { init(null, arrayOf(AnyCertificate), SecureRandom()) }
  }
}

private object AnyCertificate : X509TrustManager {
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

private const val TEXT = 0x1
private const val CLOSE = 0x8
private const val FINAL = 0x80
private const val MASKED = 0x80
private const val SHORT_MAX = 125
private const val TWO_BYTES = 126
private const val BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// Sixteen random bytes in base64, written without an encoder: `java.util.Base64`
// is not on the oldest Android this app runs on. Sixteen bytes are 21 free
// characters, one that carries two bits, and the padding.
private fun nonce(): String {
  val random = SecureRandom()
  val free = (1..21).map { BASE64[random.nextInt(BASE64.length)] }.joinToString("")
  return free + "AQgw"[random.nextInt(4)] + "=="
}
