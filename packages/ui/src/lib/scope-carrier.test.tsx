// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { Drawer } from '#ui/components/organisms/drawer';
import { KitProvider } from '#ui/configure';
import { Portal } from './portal';

afterEach(cleanup);

const scopeOf = (node: Element | null) => node?.closest('[data-kroma-theme]') ?? null;

describe('content rendered outside its styling root', () => {
  it("carries the root's theme and ground to a portal under the document", () => {
    const { container } = render(
      <KitProvider config={{ ground: 'light' }}>
        <Portal>
          <span data-testid="pop">pop</span>
        </Portal>
      </KitProvider>,
    );
    const root = container.querySelector('[data-kroma-theme]');

    const carried = scopeOf(screen.getByTestId('pop'));

    expect(container.contains(carried)).toBe(false);
    expect(carried?.getAttribute('data-kroma-theme')).toBe(root?.getAttribute('data-kroma-theme'));
    expect(carried?.getAttribute('data-theme')).toBe('light');
  });

  it("carries the root's breakpoint steps", () => {
    render(
      <KitProvider config={{ designWidth: 700 }}>
        <Portal>
          <span data-testid="pop">pop</span>
        </Portal>
      </KitProvider>,
    );

    const carried = scopeOf(screen.getByTestId('pop'));

    expect(carried?.getAttribute('data-kroma-bp')).toBe('base md');
  });

  it("keeps the outer root's ground under a scope that only pins a width", () => {
    render(
      <KitProvider config={{ ground: 'light' }}>
        <KitProvider config={{ designWidth: 700 }}>
          <Portal>
            <span data-testid="pop">pop</span>
          </Portal>
        </KitProvider>
      </KitProvider>,
    );

    const carried = scopeOf(screen.getByTestId('pop'));

    expect(carried?.getAttribute('data-theme')).toBe('light');
    expect(carried?.getAttribute('data-kroma-bp')).toBe('base md');
  });

  it('opens a dialog in the ground of the root that opened it', () => {
    render(
      <KitProvider config={{ ground: 'light' }}>
        <Dialog.Root open title="Modifier">
          <Text>Corps</Text>
        </Dialog.Root>
      </KitProvider>,
    );

    const carried = scopeOf(screen.getByRole('dialog', { name: 'Modifier' }));

    expect(carried?.getAttribute('data-theme')).toBe('light');
  });

  it('opens a drawer in the ground of the root that opened it', () => {
    render(
      <KitProvider config={{ ground: 'light' }}>
        <Drawer.Root open title="Registres">
          <Text>Corps</Text>
        </Drawer.Root>
      </KitProvider>,
    );

    const carried = scopeOf(screen.getByRole('dialog', { name: 'Registres' }));

    expect(carried?.getAttribute('data-theme')).toBe('light');
  });

  it('adds nothing outside every styling root', () => {
    render(
      <Portal>
        <span data-testid="pop">pop</span>
      </Portal>,
    );

    expect(scopeOf(screen.getByTestId('pop'))).toBeNull();
  });
});
