import { memo } from 'react';
import { describe, expect, it } from 'vitest';
import { componentName, nameComponent } from './component-names';

function Probe() {
  return null;
}

function PartFirst() {
  return null;
}

function FlatFirst() {
  return null;
}

const forwarded = () => ({ $$typeof: Symbol.for('react.forward_ref'), render: () => null });

describe('nameComponent', () => {
  it('names a function component and records it', () => {
    nameComponent(Probe, 'Probe');

    expect(Reflect.get(Probe, 'displayName')).toBe('Probe');
    expect(componentName(Probe)).toBe('Probe');
  });

  it('names a memo wrapper, the type a fiber carries', () => {
    const type = memo(Probe);

    nameComponent(type, 'Probe');

    expect(type.displayName).toBe('Probe');
    expect(componentName(type)).toBe('Probe');
  });

  it('names a forwardRef wrapper', () => {
    const type = forwarded();

    nameComponent(type, 'Dialog.Footer');

    expect(Reflect.get(type, 'displayName')).toBe('Dialog.Footer');
    expect(componentName(type)).toBe('Dialog.Footer');
  });

  it('records a frozen type without throwing, and leaves it as it was', () => {
    const frozen = Object.freeze(forwarded());

    nameComponent(frozen, 'Frozen');

    expect(Reflect.get(frozen, 'displayName')).toBeUndefined();
    expect(componentName(frozen)).toBe('Frozen');
  });

  it('never touches a door export that is a schema or a table', () => {
    const table = { Root: 'root' };

    nameComponent(table, 'Table');

    expect(Reflect.has(table, 'displayName')).toBe(false);
    expect(componentName(table)).toBeUndefined();
  });

  it('skips a value that cannot be a component', () => {
    for (const value of ['Probe', undefined, null, 4]) {
      expect(() => nameComponent(value, 'Probe')).not.toThrow();
      expect(componentName(value)).toBeUndefined();
    }
  });

  it('keeps a part name when the flat name arrives after it', () => {
    nameComponent(PartFirst, 'Dialog.Footer');
    nameComponent(PartFirst, 'Footer');

    expect(componentName(PartFirst)).toBe('Dialog.Footer');
    expect(Reflect.get(PartFirst, 'displayName')).toBe('Dialog.Footer');
  });

  it('lets a part name replace a flat one that arrived first', () => {
    nameComponent(FlatFirst, 'Footer');
    nameComponent(FlatFirst, 'Dialog.Footer');

    expect(componentName(FlatFirst)).toBe('Dialog.Footer');
  });
});

describe('componentName', () => {
  it('knows nothing of a component the kit did not name', () => {
    expect(componentName(memo(Probe))).toBeUndefined();
  });
});
