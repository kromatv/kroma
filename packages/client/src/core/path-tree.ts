/** A callable tree that names a path without knowing what is at its end: reading
 * any member answers the tree one step deeper (the same one each time), and
 * calling a node hands its path to `leaf`. A function's own properties (`name`,
 * `call`, `bind`...) read as the function's, and `then` as absent, so a spy, a
 * printer or an `await` sees a plain function. */
export function pathTree(
  path: readonly string[],
  leaf: (path: readonly string[]) => (...args: unknown[]) => unknown,
): object {
  const children = new Map<string, object>();
  return new Proxy(leaf(path), {
    get(target, key, receiver) {
      if (typeof key !== 'string' || Reflect.has(target, key)) {
        return Reflect.get(target, key, receiver);
      }
      if (key === 'then') return undefined;
      let child = children.get(key);
      if (!child) {
        child = pathTree([...path, key], leaf);
        children.set(key, child);
      }
      return child;
    },
  });
}
