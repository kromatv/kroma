package expo.modules.devicehardware

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android TV set's own CPU and memory counts, for the About screen. Hermes
 * exposes no `navigator.hardwareConcurrency` / `navigator.deviceMemory`, so the
 * numbers come from the runtime and ActivityManager instead. Both are cheap
 * synchronous reads, so a plain [Function] (called on the JS thread) is enough.
 */
class DeviceHardwareModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DeviceHardware")

    Function("cpuCores") {
      Runtime.getRuntime().availableProcessors()
    }

    // totalMem is a Long; JS numbers are doubles and RAM sizes sit far inside
    // the 2^53 a double holds exactly, so the width is not a concern.
    Function("memoryBytes") {
      memoryInfo().totalMem.toDouble()
    }

    Function("freeMemoryBytes") {
      memoryInfo().availMem.toDouble()
    }
  }

  private fun memoryInfo(): ActivityManager.MemoryInfo {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val info = ActivityManager.MemoryInfo()
    manager.getMemoryInfo(info)
    return info
  }
}
