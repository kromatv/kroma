package expo.modules.lanreach

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What a KROMA app does to a television on its own network that HTTP cannot.
 *
 * A Samsung set in standby keeps its network on and takes remote keys over its
 * own remote service, which is how it is switched on: it does not wake for a
 * Wake-on-LAN packet on Wi-Fi. The packet is here for every other set.
 */
class LanReachModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LanReach")

    AsyncFunction("samsungKey") { address: String, key: String, token: String? ->
      SamsungRemote(address, token).press(key)
    }

    AsyncFunction("magic") { mac: String -> MagicPacket(mac).broadcast() }
  }
}
