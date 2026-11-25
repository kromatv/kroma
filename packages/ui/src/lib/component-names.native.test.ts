import { memo } from 'react';
import { describe, expect, it } from 'vitest';
import { componentName, nameComponent } from './component-names';

const TYPES: readonly [string, () => unknown][] = [
  ['a function', () => () => null],
  ['a memo wrapper', () => memo(() => null)],
  [
    'a forwardRef wrapper',
    () => ({ $$typeof: Symbol.for('react.forward_ref'), render: () => null }),
  ],
  ['a frozen type', () => Object.freeze({ $$typeof: Symbol.for('react.memo'), type: () => null })],
];

describe('the names under Metro resolution', () => {
  it.each(TYPES)('records %s under its name', (_, make) => {
    const type = make();

    nameComponent(type, 'Select.Item');

    expect(componentName(type)).toBe('Select.Item');
  });

  it.each(['Text', undefined, { Root: 'root' }])('skips %s without throwing', (value) => {
    expect(() => nameComponent(value, 'Text')).not.toThrow();
    expect(componentName(value)).toBeUndefined();
  });

  it('never lets a flat name replace a part name', () => {
    const type = memo(() => null);

    nameComponent(type, 'Select.Item');
    nameComponent(type, 'Item');

    expect(componentName(type)).toBe('Select.Item');
    expect(type.displayName).toBe('Select.Item');
  });
});
