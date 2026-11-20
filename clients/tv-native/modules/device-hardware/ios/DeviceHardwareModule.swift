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

    // VideoToolbox publishes no decoder size limit, so Apple declares none and
    // playback is never gated on frame size here.
    Function("decoderFrameLimits") {
      [String: [String: Int]]()
    }

    Function("localAddress") {
      localAddress()
    }
  }
}

// The IPv4 address of the interface this set is on the network by: the first
// Ethernet or Wi-Fi interface that is up. nil when it is on no network.
private func localAddress() -> String? {
  var first: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&first) == 0 else {
    return nil
  }
  defer { freeifaddrs(first) }
  for entry in sequence(first: first, next: { $0?.pointee.ifa_next }) {
    guard let interface = entry?.pointee, let address = interface.ifa_addr else {
      continue
    }
    let up = interface.ifa_flags & UInt32(IFF_UP | IFF_RUNNING) == UInt32(IFF_UP | IFF_RUNNING)
    let wired = String(cString: interface.ifa_name).hasPrefix("en")
    guard up, wired, address.pointee.sa_family == sa_family_t(AF_INET) else {
      continue
    }
    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
    let length = socklen_t(address.pointee.sa_len)
    if getnameinfo(address, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
      return String(cString: host)
    }
  }
  return nil
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
