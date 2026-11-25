import { type TurboModule, TurboModuleRegistry } from 'react-native';
import { type Fiber, hostNodeOf } from './react-fiber';

interface NativeDom extends TurboModule {
  getBoundingClientRect(node: unknown, includeTransform: boolean): readonly number[];
}

function shadowNode(fiber: Fiber): unknown {
  const instance = hostNodeOf(fiber);
  return typeof instance === 'object' && instance !== null ? Reflect.get(instance, 'node') : null;
}

/** The rectangle of the element a host fiber drew: under Fabric, what the
 *  renderer's DOM module measures for its shadow node, the same call a ref's
 *  `getBoundingClientRect()` makes. */
export function hostRect(fiber: Fiber): unknown {
  const node = shadowNode(fiber);
  const dom = TurboModuleRegistry.get<NativeDom>('NativeDOMCxx');
  if (!dom || node === null || node === undefined) {
    return null;
  }
  const rect: unknown = dom.getBoundingClientRect(node, true);
  if (!Array.isArray(rect)) {
    return null;
  }
  const [x, y, width, height]: unknown[] = rect;
  return { x, y, width, height };
}
