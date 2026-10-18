// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { KitProvider } from '../src/configure';
import { createTheme, type ThemeRuntime } from '../src/core/theme';
import { CompiledStyleRoot } from './style-roots.fixture';

it('recomputes compiled declaration, shorthand and text paint only in the owning root', () => {
  const controls: { a?: ThemeRuntime } = {};
  const a = render(
    <KitProvider
      config={{ theme: createTheme({ colors: { accent: '#FF0000' } }), designWidth: 320 }}
    >
      <CompiledStyleRoot
        expose={(v) => {
          controls.a = v;
        }}
      />
    </KitProvider>,
  );
  const b = render(
    <KitProvider
      config={{ theme: createTheme({ colors: { accent: '#0000FF' } }), designWidth: 1920 }}
    >
      <CompiledStyleRoot expose={() => {}} />
    </KitProvider>,
  );
  const paint = (container: HTMLElement, id: string) =>
    getComputedStyle(container.querySelector(`[data-testid="${id}"]`) as Element);
  expect(paint(a.container, 'declaration').paddingLeft).toBe('8px');
  expect(paint(b.container, 'declaration').paddingLeft).toBe('32px');
  act(() => controls.a?.setTheme(createTheme({ colors: { accent: '#00FF00' } })));
  for (const id of ['declaration', 'shorthand']) {
    expect(paint(a.container, id).backgroundColor).toBe('rgb(0, 255, 0)');
    expect(paint(b.container, id).backgroundColor).toBe('rgb(0, 0, 255)');
  }
  expect(paint(a.container, 'type').color).toBe('rgb(0, 255, 0)');
  expect(paint(b.container, 'type').color).toBe('rgb(0, 0, 255)');
});
