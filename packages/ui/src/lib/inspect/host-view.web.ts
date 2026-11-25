import { type Fiber, hostNodeOf } from './react-fiber';

/** What a `ref` on a host fiber's element gives: on the web, the DOM element. */
export function hostView(fiber: Fiber): unknown {
  return hostNodeOf(fiber) ?? null;
}
