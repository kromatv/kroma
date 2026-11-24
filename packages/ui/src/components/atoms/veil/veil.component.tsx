import { VeilLayer } from '#ui/lib/veil-layer.component';
import type { VeilProps } from './veil.types';

/** The darkening laid over full-screen art so what stands on it reads. */
function Veil({ ramp }: Readonly<VeilProps>) {
  return <VeilLayer ramp={ramp} />;
}

export type { VeilProps };
export { Veil };
