// The classes a registered style compiles to, for an element react-native-web
// never renders: an <img>, an <svg>, a client's own <div>. A style handed here
// unregistered paints nothing and, on a dev server, is named in the console.

import { StyleSheet } from 'react-native';
import { WEB } from '#ui/lib/platform';

type Resolver = (styles: unknown) => [string, unknown];

type Layer = object | null | undefined | false;

const SINGLE = new WeakMap<object, string | undefined>();

export function classes(...layers: Layer[]): string | undefined {
  if (!WEB) return undefined;
  const live = layers.filter((layer): layer is object => Boolean(layer));
  if (live.length === 0) return undefined;
  const resolve = StyleSheet as unknown as Resolver;
  if (live.length > 1) return resolve(live)[0] || undefined;
  const one = live[0] as object;
  if (SINGLE.has(one)) return SINGLE.get(one);
  const name = resolve([one])[0] || undefined;
  SINGLE.set(one, name);
  return name;
}
