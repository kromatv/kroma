import { View } from 'react-native';
import { sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { gradient } from './css';

const sDefinition = styles({ layer: { fill: true, pointerEvents: 'none' } });

/** The ramp as a gradient React Native draws itself. */
export function VeilLayer({ ramp }: Readonly<{ ramp: string }>) {
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  return <View style={[s.layer, sharedStyle(`veil:${ramp}`, gradient(ramp), scope)]} />;
}
