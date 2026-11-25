import { type Fiber, hostNodeOf } from './react-fiber';

/** The rectangle of the element a host fiber drew: on the web, the DOM
 *  element's own `getBoundingClientRect()`. */
export function hostRect(fiber: Fiber): unknown {
  const element = hostNodeOf(fiber);
  if (typeof element !== 'object' || element === null || !('getBoundingClientRect' in element)) {
    return null;
  }
  const measure: unknown = element.getBoundingClientRect;
  return typeof measure === 'function' ? Reflect.apply(measure, element, []) : null;
}
