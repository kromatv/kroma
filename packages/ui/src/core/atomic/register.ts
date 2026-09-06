import { StyleSheet } from 'react-native';
import { isStaticStyle, markStatic, type StaticStates } from './static-style';

/**
 * A style the build compiled, made live: marked, frozen and registered with
 * the renderer, which compiles it to the classes the build emitted and inserts
 * nothing. What the build writes in place of a static declaration.
 */
export function staticStyle(
  values: Record<string, unknown>,
  states?: StaticStates,
): Record<string, unknown> {
  markStatic(values, states);
  Object.freeze(values);
  StyleSheet.create({ compiled: values as never });
  return values;
}

/**
 * Static layers merged into one, last wins per property, as a recipe merges
 * its cascade. Every layer has to be static: every rule the result needs is
 * then already in the sheet, so the merge can be registered the same way.
 */
export function mergeStatic(layers: readonly object[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!isStaticStyle(layer)) {
      throw new Error('mergeStatic: a static slot was handed a layer the build did not compile');
    }
    Object.assign(merged, layer);
  }
  return staticStyle(merged);
}
