// Browser adapter; Metro selects the native shell adapter at build time.

export type { ClientHardware, HardwareSource } from './hardware-readings';
export { readClientHardware as clientHardware } from './hardware-readings';
