// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { Drawer } from '#ui/components/organisms/drawer';
import { SURFACE_WIDTH } from '#ui/lib/surface-shell';
import { Dialog } from './dialog';

afterEach(cleanup);

const width = (name: string) => getComputedStyle(screen.getByRole('dialog', { name })).width;

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
