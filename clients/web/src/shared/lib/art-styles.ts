import { posterColors, posterGradient } from '@kromatv/core';
import { DEFAULT_STYLE_SCOPE, type StyleScope, sharedStyle } from '@kromatv/ui/kit';

/** The two-stop key-art wash `posterColors` derives from an id, as a
 * registered style: one class per hue, shared by every tile in that hue. */
export function posterWash(id: string, scope: StyleScope = DEFAULT_STYLE_SCOPE): object {
  const [c1, c2] = posterColors(id);
  return wash(c1, c2, undefined, scope);
}

/** A two-stop wash from its colours, registered once per pair and angle. */
export function wash(
  c1: string,
  c2: string,
  angle = 158,
  scope: StyleScope = DEFAULT_STYLE_SCOPE,
): object {
  return sharedStyle(
    `wash:${angle}:${c1}:${c2}`,
    {
      backgroundImage: `linear-gradient(${angle}deg, ${c1}, ${c2})`,
    },
    scope,
  );
}

/** The layered key-art scrim `posterGradient` derives from a title, registered
 * once per hue. */
export function posterScrim(title: string, scope: StyleScope = DEFAULT_STYLE_SCOPE): object {
  const image = posterGradient(title);
  return sharedStyle(`scrim:${image}`, { backgroundImage: image }, scope);
}
