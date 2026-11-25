// The classes a registered style compiles to, for an element react-native-web
// never renders: an <img>, an <svg>, a client's own <div>. A style handed here
// unregistered paints nothing and, on a dev server, is named in the console.

import type { TextDirection } from '@kromatv/i18n';
import { StyleSheet } from 'react-native';
import { webDocument } from '#ui/lib/dom';
import { WEB } from '#ui/lib/platform';

type Resolver = (
  styles: unknown,
  options: { writingDirection: TextDirection },
) => [string, unknown];

type Layer = object | null | undefined | false;

const SINGLE: Readonly<Record<TextDirection, WeakMap<object, string | undefined>>> = {
  ltr: new WeakMap(),
  rtl: new WeakMap(),
};

const pageDirection = (): TextDirection =>
  webDocument()?.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';

/** The class names `layers` compile to, laid out the way the page is written:
 *  a start or an end lands on the side `<html dir>` names. Undefined off the
 *  browser targets, and for no style at all. */
export function classes(...layers: Layer[]): string | undefined {
  if (!WEB) {
    return undefined;
  }
  const live = layers.filter((layer): layer is object => Boolean(layer));
  if (live.length === 0) {
    return undefined;
  }
  const resolve = StyleSheet as unknown as Resolver;
  const options = { writingDirection: pageDirection() };
  if (live.length > 1) {
    return resolve(live, options)[0] || undefined;
  }
  const one = live[0] as object;
  const cache = SINGLE[options.writingDirection];
  if (cache.has(one)) {
    return cache.get(one);
  }
  const name = resolve([one], options)[0] || undefined;
  cache.set(one, name);
  return name;
}
