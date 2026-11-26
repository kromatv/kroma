import type { Fiber } from './react-fiber';
import type { TextClip } from './text-clip';

/** What a component's text loses to its box: under React Native, not measured
 *  yet, so always null. A Paragraph lays out only the lines it keeps, and
 *  `onTextLayout` does not say on every platform whether it dropped any. */
export function hostClip(_fiber: Fiber): TextClip | null {
  return null;
}
