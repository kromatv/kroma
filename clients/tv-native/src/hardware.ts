// Platform capabilities are available before the shared TV modules evaluate.
import { readClientHardware } from '@kromatv/tv/hardware';
import { nativeHardware } from './lib/native-hardware';
export function clientHardware() {
  return readClientHardware(nativeHardware);
}
