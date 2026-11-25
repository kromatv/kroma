// @vitest-environment jsdom
import { record } from '@kromatv/react-audit';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { componentName } from '#ui/lib/component-names';
import { DismissBackdrop } from '#ui/lib/dismiss-backdrop.component';
import { ScopeCarrier } from '#ui/lib/scope-carrier.component';
import * as services from './index';
import * as kit from './kit';

afterEach(cleanup);

const WRAPPERS = new Set([Symbol.for('react.memo'), Symbol.for('react.forward_ref')]);

const PASCAL = /^[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*$/;

const isComponent = (value: unknown) =>
  typeof value === 'function'
    ? !Function.prototype.toString.call(value).startsWith('class')
    : typeof value === 'object' && value !== null && WRAPPERS.has(Reflect.get(value, '$$typeof'));

const isNamespace = (value: unknown): value is object =>
  typeof value === 'object' &&
  value !== null &&
  !Reflect.has(value, '$$typeof') &&
  Object.values(value).length > 0 &&
  Object.values(value).every(isComponent);

const exports = [...Object.entries(kit), ...Object.entries(services)].filter(([key]) =>
  PASCAL.test(key),
);

const parts = exports.flatMap(([key, value]) =>
  isNamespace(value)
    ? Object.entries(value).map(([part, type]): [string, unknown] => [`${key}.${part}`, type])
    : [],
);

const partName = new Map(parts.map(([name, type]) => [type, name]));

const components = exports
  .filter(([, value]) => isComponent(value))
  .map(([name, type]): [string, unknown] => [partName.get(type) ?? name, type]);

const misnamed = (entries: readonly [string, unknown][]) =>
  entries
    .filter(
      ([name, type]) =>
        componentName(type) !== name || Reflect.get(Object(type), 'displayName') !== name,
    )
    .map(([name, type]) => `${name} is ${String(componentName(type))}`);

describe('the names the build gives the kit doors', () => {
  it('covers both doors, so an empty list below means something', () => {
    expect(components.length).toBeGreaterThan(100);
    expect(parts.length).toBeGreaterThan(170);
    expect(components.map(([name]) => name)).toContain('I18nProvider');
    expect(parts.map(([name]) => name)).toContain('Player.Root');
  });

  it('names every component after its export, or after the part it also is', () => {
    expect(misnamed(components)).toEqual([]);
  });

  it('names every part of a namespace after the namespace and its key', () => {
    expect(misnamed(parts)).toEqual([]);
  });

  it('names nothing no door exports', () => {
    for (const type of [DismissBackdrop, ScopeCarrier]) {
      expect(componentName(type)).toBeUndefined();
      expect(Reflect.get(type, 'displayName')).toBeUndefined();
    }
  });

  it('gives the namespace object itself no new property', () => {
    expect(Object.keys(kit.Dialog)).toEqual(['Root', 'Header', 'Panel', 'Footer', 'Actions']);
  });

  it('shows the part names on the components a mounted compound renders', () => {
    const run = record();

    render(
      <kit.Callout.Root tone="danger" icon="alert-triangle">
        <kit.Callout.Title>Titre</kit.Callout.Title>
        <kit.Callout.Detail>Detail</kit.Callout.Detail>
      </kit.Callout.Root>,
    );
    const names = run.stop().components.map(([name]) => name);

    expect(names).toEqual(
      expect.arrayContaining(['Callout.Root', 'Callout.Title', 'Callout.Detail', 'Text']),
    );
  });
});
