package expo.modules.lanbeacon

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.ServerSocket
import java.util.Collections
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

// Publishing "this television is waiting for an account" on the link, and
// hearing it from a telephone in the same room.
//
// Why the link at all, when the server already brokers this: a link-local
// multicast does not cross a router, so hearing one is proof of being in the
// room. The server can only compare the two devices' addresses, which it loses
// to NAT, to a routed house, and to a dual-stack one. What is published here
// carries a proof string the server will take instead.
//
// Unlike the Apple half, discovery here cannot read the text record: NsdManager
// only fills the attributes in on RESOLVE, so every hit is resolved and the
// resolves are serialised, exactly as the server-discovery module beside this
// one has to do (concurrent resolves fail with FAILURE_ALREADY_ACTIVE and a
// house with several televisions would lose all but the first).
private const val SERVICE_TYPE = "_kroma-tv._tcp."
private const val FOUND_EVENT = "lan-beacon:found"

// Generous: an unanswered resolve poisons the manager, so the cost of waiting
// too little is far higher than the cost of waiting too long.
private const val RESOLVE_TIMEOUT_SECONDS = 8L
private const val MAX_RETRIES = 4

class LanBeaconModule : Module() {
  private var nsd: NsdManager? = null
  private var registration: NsdManager.RegistrationListener? = null
  private var advertisedSocket: ServerSocket? = null
  private var browse: Browse? = null
  private var advertised: Pair<String, Map<String, String>>? = null
  private var retries = 0
  private val handler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("LanBeacon")
    Events(FOUND_EVENT)

    Function("publish") { name: String, txt: Map<String, String> ->
      publish(name, txt)
    }

    Function("unpublish") { unpublish() }

    Function("startBrowse") { epoch: Int -> startBrowse(epoch) }

    Function("stopBrowse") { stopBrowse() }

    OnDestroy {
      unpublish()
      stopBrowse()
    }
  }

  private fun manager(): NsdManager? {
    if (nsd == null) {
      nsd = appContext.reactContext?.getSystemService(Context.NSD_SERVICE) as? NsdManager
    }
    return nsd
  }

  private fun publish(name: String, txt: Map<String, String>) {
    unpublish()
    advertised = name to txt
    retries = 0
    republish()
  }

  private fun republish() {
    val (name, txt) = advertised ?: return
    val manager = manager() ?: return
    releaseRegistration()

    // A DNS-SD advertisement needs a port, so one is taken and held. Nothing
    // ever connects to it: the record IS the message, and the grant it leads to
    // travels to the server over ordinary HTTP. Holding the socket is what
    // keeps the port ours for as long as the record names it.
    val socket = runCatching { ServerSocket(0) }.getOrNull() ?: return
    advertisedSocket = socket

    val info = NsdServiceInfo().apply {
      serviceName = name
      serviceType = SERVICE_TYPE
      port = socket.localPort
      for ((key, value) in txt) setAttribute(key, value)
    }
    val listener = object : NsdManager.RegistrationListener {
      override fun onServiceRegistered(info: NsdServiceInfo) {
        retries = 0
      }

      // A television is the one device nobody is holding, so a beacon that dies
      // silently is a beacon nobody notices. NSD fails registration for reasons
      // that pass - Wi-Fi settling after a cold boot, a name already taken -
      // and the set would otherwise advertise nothing for the rest of the run.
      override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
        if (retries >= MAX_RETRIES) return
        retries += 1
        val delay = 1000L shl (retries - 1)
        handler.postDelayed({ if (advertised != null) republish() }, delay)
      }

      override fun onServiceUnregistered(info: NsdServiceInfo) = Unit
      override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) = Unit
    }
    registration = listener
    // A network that refuses to multicast is a television that pairs through
    // the server, which is the path it was taking anyway.
    runCatching { manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener) }
      .onFailure { unpublish() }
  }

  private fun unpublish() {
    advertised = null
    retries = 0
    handler.removeCallbacksAndMessages(null)
    releaseRegistration()
  }

  private fun releaseRegistration() {
    registration?.let { listener -> runCatching { nsd?.unregisterService(listener) } }
    registration = null
    runCatching { advertisedSocket?.close() }
    advertisedSocket = null
  }

  // A private method rather than the body of the `Function` lambda: an early
  // return inside one fights the return type Expo infers for it.
  private fun startBrowse(epoch: Int) {
    val manager = manager() ?: return
    stopBrowse()
    browse = Browse(manager) { services ->
      sendEvent(FOUND_EVENT, mapOf("services" to services, "epoch" to epoch))
    }.also { it.start() }
  }

  private fun stopBrowse() {
    browse?.stop()
    browse = null
  }
}

// One continuous browse. Holds what is currently audible and republishes the
// WHOLE view on every change, because a telephone that missed a departure would
// otherwise offer a television that has gone.
private class Browse(
  private val nsd: NsdManager,
  private val onFound: (List<Map<String, Any>>) -> Unit,
) {
  // Guarded by its own monitor rather than `Collections.synchronizedMap`: the
  // wrapper synchronizes each CALL, but traversing `values` is several, and
  // `record()` (worker thread) and `onServiceLost` (NsdManager's callback
  // thread) do exactly that against each other.
  private val audible = linkedMapOf<String, Map<String, Any>>()
  private val pending = ArrayBlockingQueue<NsdServiceInfo>(64)
  private val running = AtomicBoolean(false)
  private val discovering = AtomicBoolean(false)
  private var worker: Thread? = null

  private val listener = object : NsdManager.DiscoveryListener {
    override fun onServiceFound(service: NsdServiceInfo) {
      pending.offer(service)
    }

    override fun onServiceLost(service: NsdServiceInfo) {
      val name = service.serviceName ?: return
      val gone = synchronized(audible) { audible.remove(name) != null }
      if (gone) publish()
    }

    override fun onDiscoveryStarted(serviceType: String) = Unit
    override fun onDiscoveryStopped(serviceType: String) = Unit

    // NsdManager reports a failed START here, not by throwing, so this is the
    // only place the caller can be told the link is not going to answer:
    // multicast filtered on guest wifi, another app holding NSD, or the
    // permission refused. Saying "nothing here" beats a picker that waits.
    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
      discovering.set(false)
      if (running.getAndSet(false)) onFound(emptyList())
    }

    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
  }

  fun start() {
    if (!running.compareAndSet(false, true)) return
    discovering.set(true)
    val started = runCatching {
      nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    }.isSuccess
    if (!started) {
      // No multicast on this network: an empty view, and the caller falls back
      // to the server source it always had.
      discovering.set(false)
      running.set(false)
      onFound(emptyList())
      return
    }
    worker = Thread { drain() }.also { it.start() }
  }

  // Not gated on `running`: the worker clears that flag on its own, and a stop
  // that read it as proof of having unregistered would leave this discovery on
  // the shared NsdManager while the next browse registers another.
  fun stop() {
    running.set(false)
    if (discovering.compareAndSet(true, false)) {
      runCatching { nsd.stopServiceDiscovery(listener) }
    }
    worker?.interrupt()
    worker = null
  }

  // One resolve at a time, for as long as the browse is up.
  private fun drain() {
    while (running.get()) {
      val service = runCatching { pending.poll(200, TimeUnit.MILLISECONDS) }.getOrNull() ?: continue
      val gate = ArrayBlockingQueue<Boolean>(1)
      @Suppress("DEPRECATION") // registerServiceInfoCallback is API 34+; this ships to older TVs.
      nsd.resolveService(
        service,
        object : NsdManager.ResolveListener {
          override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
            gate.offer(true)
          }

          override fun onServiceResolved(info: NsdServiceInfo) {
            record(info)
            gate.offer(true)
          }
        },
      )
      // The legacy API allows one outstanding resolve, and the platform only
      // clears its slot when the daemon answers. Walking away from a slow one
      // and starting the next makes every later resolve fail ALREADY_ACTIVE for
      // the life of this NsdManager, so waiting is the only correct move: the
      // browse is continuous, and a television that could not be resolved comes
      // round again on the next report.
      val answered = runCatching { gate.poll(RESOLVE_TIMEOUT_SECONDS, TimeUnit.SECONDS) }
        .getOrNull() != null
      if (!answered) {
        // Nothing may be resolved through this manager again (or `stop` came in
        // and interrupted the wait). Stop rather than spin: `startBrowse` builds
        // a fresh one, and a stopped browse must not report over its successor.
        if (running.getAndSet(false)) onFound(emptyList())
        return
      }
    }
  }

  // A record with no attributes is not one of ours, whatever it is called.
  private fun record(info: NsdServiceInfo) {
    val name = info.serviceName ?: return
    val txt = info.attributes.orEmpty()
      .mapNotNull { (key, value) -> value?.let { key to String(it, Charsets.UTF_8) } }
      .toMap()
    if (txt.isEmpty()) return
    synchronized(audible) { audible[name] = mapOf("name" to name, "txt" to txt) }
    publish()
  }

  private fun publish() {
    if (!running.get()) return
    val view = synchronized(audible) { audible.values.toList() }
    onFound(view)
  }
}
