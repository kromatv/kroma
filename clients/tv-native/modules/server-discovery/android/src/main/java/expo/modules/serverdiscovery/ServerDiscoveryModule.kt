package expo.modules.serverdiscovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Collections
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Finding the server by ASKING the network, instead of guessing at it.
 *
 * The JS discovery this replaces had two moves: try the hostname `kroma.local`,
 * then probe all 253 addresses of the local /24 on port 4040. That is slow, it
 * only ever works on a /24, and it can only find a server that happens to be on
 * 4040 over plain http - so a server behind a reverse proxy on 443 was
 * invisible no matter how long it swept.
 *
 * The server has advertised itself over DNS-SD the whole time (`_kroma._tcp`,
 * see server/modules/tv.kroma.mdns) carrying its real host and its real port.
 * Nothing on this side was listening. NsdManager is Android's resolver for
 * exactly that, and it is in the platform, so this module has no dependencies.
 *
 * It answers with hosts and PORTS only. Whether a given one speaks https is not
 * mDNS's business and is not guessed at here - `resolveServerOrigin` in
 * @kroma/core settles that by asking, which also gets redirects right.
 */
private const val SERVICE_TYPE = "_kroma._tcp."

class ServerDiscoveryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ServerDiscovery")

    /**
     * Browse for `timeoutMs`, then answer with everything that resolved.
     *
     * Always the full window rather than resolving on the first hit: a house
     * with two servers should offer both, and the caller is a "Detect" button
     * that can afford a second.
     */
    AsyncFunction("browse") { timeoutMs: Int, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      browse(context, timeoutMs.coerceIn(250, 15_000), promise)
    }
  }
}

private fun browse(context: Context, timeoutMs: Int, promise: Promise) {
  val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
  if (nsd == null) {
    promise.resolve(emptyList<Map<String, Any>>())
    return
  }

  val found = Collections.synchronizedList(mutableListOf<Map<String, Any>>())
  // Resolution is SERIALISED through this queue. NsdManager historically fails
  // a resolve that starts while another is in flight (FAILURE_ALREADY_ACTIVE),
  // and a house with several servers would lose all but the first.
  val pending = ArrayBlockingQueue<NsdServiceInfo>(32)
  val done = AtomicBoolean(false)

  val listener = object : NsdManager.DiscoveryListener {
    override fun onServiceFound(service: NsdServiceInfo) {
      pending.offer(service)
    }

    override fun onServiceLost(service: NsdServiceInfo) = Unit
    override fun onDiscoveryStarted(serviceType: String) = Unit
    override fun onDiscoveryStopped(serviceType: String) = Unit
    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
  }

  // One worker drains the queue until the window closes; each resolve blocks it
  // until the callback fires, which is what keeps them one-at-a-time.
  val worker = Thread {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      val service = pending.poll(150, java.util.concurrent.TimeUnit.MILLISECONDS) ?: continue
      val gate = ArrayBlockingQueue<Boolean>(1)
      @Suppress("DEPRECATION") // registerServiceInfoCallback is API 34+; this ships to older TVs.
      nsd.resolveService(
        service,
        object : NsdManager.ResolveListener {
          override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
            gate.offer(true)
          }

          override fun onServiceResolved(info: NsdServiceInfo) {
            val host = info.host?.hostAddress
            if (host != null && info.port > 0) {
              found.add(mapOf("name" to (info.serviceName ?: ""), "host" to host, "port" to info.port))
            }
            gate.offer(true)
          }
        },
      )
      // Bounded: a resolve that never calls back must not strand the worker
      // past the window the caller was promised.
      gate.poll(3, java.util.concurrent.TimeUnit.SECONDS)
    }
    if (done.compareAndSet(false, true)) {
      runCatching { nsd.stopServiceDiscovery(listener) }
      promise.resolve(found.toList())
    }
  }

  try {
    nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
  } catch (_: Throwable) {
    // No multicast on this network (or a device that refuses to browse): an
    // empty answer, and the caller falls back to its own sweep.
    promise.resolve(emptyList<Map<String, Any>>())
    return
  }
  worker.start()
}
