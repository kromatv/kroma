// What this computer is called, asked of the Rust shell: the owner's own name
// for it ("Max's MacBook Pro"), which a phone's Play on TV list shows instead of
// the platform label. A browser dev run has no shell and keeps the label.
import { type DeviceNameSource, lateDeviceName } from '@kromatv/tv';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

const Answer = z.string().nullable();

export function desktopDeviceName(): DeviceNameSource {
  const source = lateDeviceName();
  invoke('device_name')
    .then((answer) => source.found(Answer.safeParse(answer).data))
    .catch(() => undefined);
  return source;
}
