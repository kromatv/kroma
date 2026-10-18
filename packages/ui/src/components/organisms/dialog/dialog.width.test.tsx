// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { Drawer } from '#ui/components/organisms/drawer';
import { DIALOG_PAD, dialogPad, SURFACE_WIDTH } from '#ui/lib/surface-shell';
import { Dialog } from './dialog';

afterEach(cleanup);

const width = (name: string) => getComputedStyle(screen.getByRole('dialog', { name })).width;

const pad = (name: string) => {
  const band = screen.getByRole('dialog', { name }).firstElementChild as HTMLElement;
  return getComputedStyle(band).paddingLeft;
};

describe("a panel's width", () => {
  it('is a step on the kit ladder rather than a number the call site invented', () => {
    render(
      <Dialog.Root open title="Modifier" width="lg">
        <Text>Corps</Text>
      </Dialog.Root>,
    );
    expect(width('Modifier')).toBe(`${SURFACE_WIDTH.lg}px`);
  });

  it('defaults to the step a form takes, which is what most panels hold', () => {
    render(
      <Dialog.Root open title="Modifier">
        <Text>Corps</Text>
      </Dialog.Root>,
    );
    expect(width('Modifier')).toBe(`${SURFACE_WIDTH.md}px`);
  });

  it('is the same ladder on a sheet anchored to an edge', () => {
    render(
      <Drawer.Root open title="Registres" width="xs">
        <Text>Corps</Text>
      </Drawer.Root>,
    );
    expect(width('Registres')).toBe(`${SURFACE_WIDTH.xs}px`);
  });
});

// react-native-web measures the window off the document element, which jsdom
// lays out at zero.
function windowWidth(px: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: px,
  });
  window.dispatchEvent(new Event('resize'));
}

describe("a panel's gutter", () => {
  it('frames a panel on a desk with the step the kit draws it at', () => {
    windowWidth(1440);

    render(
      <Dialog.Root open title="Modifier">
        <Text>Corps</Text>
      </Dialog.Root>,
    );

    expect(pad('Modifier')).toBe(`${DIALOG_PAD}px`);
  });

  it('gives a phone the column back, since 40 of each edge is most of its width', () => {
    windowWidth(390);

    render(
      <Dialog.Root open title="Modifier">
        <Text>Corps</Text>
      </Dialog.Root>,
    );

    expect(pad('Modifier')).toBe(`${dialogPad(390)}px`);
    windowWidth(1024);
  });
});
