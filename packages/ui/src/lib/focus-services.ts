import { createFocusProbe } from './focus-here';
import { createFocusHolder } from './focus-holder';
import { createFocusMirror } from './focus-mirror';
import { createRemoteTransport } from './focus-remote';
import { createInputGate } from './input-gate';
import { createInputSource } from './input-source';

/** A host owns its geometry, DOM mirror and remote subscribers. */
export function createFocusServices(
  enabled = false,
  input = createInputGate(),
  source = createInputSource(),
) {
  const probe = createFocusProbe();
  const mirror = createFocusMirror(source.pointerDriving);
  const remote = createRemoteTransport({ enabled, probe, mirror });
  return { enabled, input, source, probe, mirror, remote, holder: createFocusHolder() };
}
export type FocusServices = ReturnType<typeof createFocusServices>;
