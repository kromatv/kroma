// JS face of the set's own CPU and memory counts, which a Hermes shell has no
// Web API to read. Optional so a build without the native module yields null
// rather than throwing.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class DeviceHardwareNativeModule extends NativeModule {
  cpuCores(): number;
  memoryBytes(): number;
  freeMemoryBytes(): number | null;
}

const native = requireOptionalNativeModule<DeviceHardwareNativeModule>('DeviceHardware');

export function cpuCores(): number | null {
  return native ? native.cpuCores() : null;
}

export function memoryBytes(): number | null {
  return native ? native.memoryBytes() : null;
}

export function freeMemoryBytes(): number | null {
  return native ? native.freeMemoryBytes() : null;
}
