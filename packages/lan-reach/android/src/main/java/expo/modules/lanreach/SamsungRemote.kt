package expo.modules.lanreach

import java.io.DataInputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.URLEncoder
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager
import org.json.JSONObject

private const val PORT = 8002
private const val CHANNEL = "/api/v2/channels/samsung.remote.control"
private const val CONNECT_WITHIN_MS = 4_000

// "KROMA" in base64, which is how the set wants the name it shows.
private const val NAME = "S1JPTUE="

// Long enough for somebody to pick up the remote and accept the prompt the set
// shows the first time; a set that already gave a token answers at once.
private const val PAIR_WITHIN_MS = 60_000
private const val ANSWER_WITHIN_MS = 8_000

// The set drops a key it is still reading when the socket closes under it.
private const val KEY_LANDING_MS = 600L

class Refused : Exception("The television refused the connection")

class NoAnswer : Exception("The television did not answer")

/** What a frame from the set means for a connection that is being opened. */
sealed interface Greeting {
  data class Welcome(val token: String?) : Greeting

  data object Refused : Greeting

  data object Other : Greeting

  companion object {
    fun of(text: String): Greeting {
      val frame = runCatching { JSONObject(text) }.getOrNull() ?: return Other
      return when (frame.optString("event")) {
        "ms.channel.connect" -> Welcome(token(frame.optJSONObject("data")))
        "ms.channel.unauthorized", "ms.channel.timeOut" -> Refused
        else -> Other
      }
    }

    // A set sends the token as a string on one firmware and as a number on
    // another; `optString` reads both.
    private fun token(data: JSONObject?): String? =
      data?.optString("token")?.takeIf { it.isNotEmpty() }
  }
}

/**
 * One connection to a Samsung set's remote service: it waits for the set's
 * welcome, presses one key, and goes.
 *
 * The service is a WebSocket behind a certificate the set signed for itself,
 * for a name nobody can check, so there is nothing to verify it against. What
 * travels is a token the set issued and a remote key, to an address on the
 * network the person is on. The few frames this needs are written here by
 * hand, so the module brings no library.
 */
class SamsungRemote(private val address: String, private val token: String?) {
  /**
   * Presses [key] and answers the token the set welcomed this connection
   * with, which is what it wants sent back the next time.
   */
  fun press(key: String): String? =
    open().use { socket ->
      val frames = Frames(DataInputStream(socket.inputStream), socket.outputStream)
      upgrade(frames)
      val given = welcome(frames)
      frames.send(pressing(key))
      Thread.sleep(KEY_LANDING_MS)
      frames.close()
      given
    }

  private fun open(): SSLSocket {
    val socket = trusting.socketFactory.createSocket() as SSLSocket
    try {
      socket.connect(InetSocketAddress(address, PORT), CONNECT_WITHIN_MS)
      socket.soTimeout = if (token.isNullOrEmpty()) PAIR_WITHIN_MS else ANSWER_WITHIN_MS
      socket.startHandshake()
      return socket
    } catch (e: Exception) {
      socket.close()
      throw NoAnswer()
    }
  }

  private fun upgrade(frames: Frames) {
    frames.request(
      "GET ${path()} HTTP/1.1",
      "Host: $address:$PORT",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: ${nonce()}",
      "Sec-WebSocket-Version: 13",
    )
    if (!frames.status().contains(" 101 ")) {
      throw Refused()
    }
  }

  private fun path(): String {
    val query = "name=${URLEncoder.encode(NAME, "UTF-8")}"
    return if (token.isNullOrEmpty()) "$CHANNEL?$query" else "$CHANNEL?$query&token=$token"
  }

  private fun welcome(frames: Frames): String? {
    while (true) {
      val text = try {
        frames.text()
      } catch (e: Exception) {
        throw NoAnswer()
      }
      when (val greeting = Greeting.of(text)) {
        is Greeting.Welcome -> return greeting.token
        Greeting.Refused -> throw Refused()
        Greeting.Other -> continue
      }
    }
  }

  private fun pressing(key: String): String {
    val params = JSONObject()
      .put("Cmd", "Click")
      .put("DataOfCmd", key)
      .put("Option", "false")
      .put("TypeOfRemote", "SendRemoteKey")
    return JSONObject().put("method", "ms.remote.control").put("params", params).toString()
  }

  private companion object {
    val trusting: SSLContext =
      SSLContext.getInstance("TLS").apply { init(null, arrayOf(AnyCertificate), SecureRandom()) }
  }
}

private object AnyCertificate : X509TrustManager {
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

private const val BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// Sixteen random bytes in base64, written without an encoder: `java.util.Base64`
// is not on the oldest Android this app runs on. Sixteen bytes are 21 free
// characters, one that carries two bits, and the padding.
private fun nonce(): String {
  val random = SecureRandom()
  val free = (1..21).map { BASE64[random.nextInt(BASE64.length)] }.joinToString("")
  return free + "AQgw"[random.nextInt(4)] + "=="
}

private const val TEXT = 0x1
private const val CLOSE = 0x8
private const val FINAL = 0x80
private const val MASKED = 0x80
private const val SHORT_MAX = 125
private const val TWO_BYTES = 126

/** The WebSocket wire, as far as one text frame each way needs it (RFC 6455). */
private class Frames(private val input: DataInputStream, private val output: OutputStream) {
  fun request(vararg lines: String) {
    output.write((lines.joinToString("\r\n") + "\r\n\r\n").toByteArray())
    output.flush()
  }

  /** The status line of the answer, with its headers read and dropped. */
  fun status(): String {
    val head = StringBuilder()
    while (!head.endsWith("\r\n\r\n")) {
      head.append(input.readUnsignedByte().toChar())
    }
    return head.lineSequence().first()
  }

  /** The next text frame; frames of any other kind are read past. */
  fun text(): String {
    while (true) {
      val opcode = input.readUnsignedByte() and 0x0f
      val payload = ByteArray(length()).also(input::readFully)
      if (opcode == TEXT) {
        return String(payload)
      }
    }
  }

  fun send(text: String) = write(TEXT, text.toByteArray())

  fun close() = runCatching { write(CLOSE, ByteArray(0)) }

  private fun length(): Int =
    when (val short = input.readUnsignedByte() and 0x7f) {
      TWO_BYTES -> input.readUnsignedShort()
      in 0..SHORT_MAX -> short
      else -> input.readLong().toInt()
    }

  // A client masks what it sends; the set does not.
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
}
