import { type Fiber, field, hostNodeOf } from './react-fiber';

/** What a `ref` on a host fiber's element gives: under Fabric, the public
 *  instance the renderer keeps on the instance's `canonical`, read and never
 *  created, or null before anything asked for it. */
export function hostView(fiber: Fiber): unknown {
  return field(field(hostNodeOf(fiber), 'canonical'), 'publicInstance') ?? null;
}
