// Browser adapter; Metro selects the native shell adapter at build time.

export type { ClientHardware, HardwareSource } from './hardwareReadings';
export { readClientHardware as clientHardware } from './hardwareReadings';
