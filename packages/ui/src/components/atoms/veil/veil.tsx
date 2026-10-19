// <Veil>: the darkening laid over full-screen art so what stands on it reads.

import { VeilLayer } from '#ui/lib/veil-layer';
import type { VeilProps } from './veil.types';

function Veil({ ramp }: Readonly<VeilProps>) {
  return <VeilLayer ramp={ramp} />;
}

export type { VeilProps };
export { Veil };
