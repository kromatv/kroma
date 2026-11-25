const names = new WeakMap<object, string>();

const isKey = (value: unknown): value is object =>
  typeof value === 'function' || (typeof value === 'object' && value !== null);

const isComponentType = (value: unknown): value is object =>
  typeof value === 'function' || (isKey(value) && '$$typeof' in value);

const isPart = (name: string) => name.includes('.');

/** Records `name` as the public name of a kit component and sets it as its
 *  `displayName`. The build appends the call; anything but a function or a
 *  React type object (`memo`, `forwardRef`) is left untouched, and a part's
 *  name (`Dialog.Footer`) is never replaced by a flat one. */
export function nameComponent(component: unknown, name: string): void {
  if (!isComponentType(component)) {
    return;
  }
  const known = names.get(component);
  if (known !== undefined && isPart(known) && !isPart(name)) {
    return;
  }
  names.set(component, name);
  Reflect.set(component, 'displayName', name);
}

/** The public name the kit gave a component type (a fiber's `elementType`),
 *  or undefined for anything the kit did not name. */
export function componentName(type: unknown): string | undefined {
  return isKey(type) ? names.get(type) : undefined;
}
