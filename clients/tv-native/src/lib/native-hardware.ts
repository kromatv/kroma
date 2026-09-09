import type { HardwareSource } from '@kromatv/tv';
import { cpuCores, freeMemoryBytes, memoryBytes } from '../../modules/device-hardware';

export const nativeHardware: HardwareSource = { cpuCores, memoryBytes, freeMemoryBytes };
