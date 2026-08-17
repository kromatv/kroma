import ExpoModulesCore
import Foundation

/**
 The Apple TV's own CPU and memory counts, for the About screen. Hermes exposes
 no `navigator.hardwareConcurrency` / `navigator.deviceMemory`, so the numbers
 come from ProcessInfo instead - synchronous constants of the running set, so a
 plain `Function` (read on the JS thread) is enough, no promise needed.
 */
public class DeviceHardwareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceHardware")

    Function("cpuCores") {
      ProcessInfo.processInfo.activeProcessorCount
    }

    // physicalMemory is UInt64; JS numbers are doubles, and RAM sizes are far
    // inside the 2^53 a double holds exactly, so the width is not a concern.
    Function("memoryBytes") {
      Double(ProcessInfo.processInfo.physicalMemory)
    }

    Function("freeMemoryBytes") {
      freeMemoryBytes()
    }
  }
}

// Darwin has no equivalent of Android's `availMem`, so the free pages are read
// off the VM statistics and sized. Inactive pages count as free: they are
// reclaimable on demand, and leaving them out reports a television as far
// tighter on memory than it is. nil when the kernel declines to answer, which
// hides the row rather than printing a zero.
private func freeMemoryBytes() -> Double? {
  var stats = vm_statistics64_data_t()
  var count = mach_msg_type_number_t(
    MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride
  )
  let result = withUnsafeMutablePointer(to: &stats) { pointer in
    pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
      host_statistics64(mach_host_self(), HOST_VM_INFO64, rebound, &count)
    }
  }
  guard result == KERN_SUCCESS else { return nil }
  let pageSize = Double(vm_kernel_page_size)
  return (Double(stats.free_count) + Double(stats.inactive_count)) * pageSize
}
