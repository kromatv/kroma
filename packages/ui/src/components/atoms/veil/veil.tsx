// <Veil>: the darkening laid over full-screen art so what stands on it reads.

import { View } from 'react-native';
import { sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { gradient } from '#ui/lib/css';
import type { VeilProps } from './veil.types';

const sDefinition = styles({ layer: { fill: true, pointerEvents: 'none' } });

function Veil({ ramp }: Readonly<VeilProps>) {
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  return <View style={[s.layer, sharedStyle(`veil:${ramp}`, gradient(ramp), scope)]} />;
}

export type { VeilProps };
export { Veil };
