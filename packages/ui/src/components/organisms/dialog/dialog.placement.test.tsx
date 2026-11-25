// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { Drawer } from '#ui/components/organisms/drawer';
import { Dialog } from './dialog.component';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function SaveFooter() {
  return (
    <Dialog.Footer>
      <Text>Enregistrer</Text>
    </Dialog.Footer>
  );
}

function SheetHeader() {
  return (
    <Drawer.Header>
      <Text>Registres</Text>
    </Drawer.Header>
  );
}

describe('a band its Root cannot place', () => {
  it('is named when a component of the caller returns a dialog footer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog.Root open title="Modifier">
        <Text>Corps</Text>
        <SaveFooter />
      </Dialog.Root>,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('<Dialog.Footer> is not a direct child of <Dialog.Root>'),
    );
  });

  it('is named when a component of the caller returns a drawer header', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Drawer.Root open title="Registres">
        <SheetHeader />
        <Text>Corps</Text>
      </Drawer.Root>,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('<Drawer.Header> is not a direct child of <Drawer.Root>'),
    );
  });

  it('is counted when it sits beside a panel the caller wrote, where it is not drawn at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog.Root open title="Modifier">
        <Dialog.Panel>
          <Text>Corps</Text>
        </Dialog.Panel>
        <SaveFooter />
      </Dialog.Root>,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('<Dialog.Root> was given a <Dialog.Panel>'),
    );
  });

  it('is counted beside a drawer panel too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Drawer.Root open title="Registres">
        <SheetHeader />
        <Drawer.Panel>
          <Text>Corps</Text>
        </Drawer.Panel>
      </Drawer.Root>,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('<Drawer.Root> was given a <Drawer.Panel>'),
    );
  });

  it('leaves a dialog whose bands are its direct children quiet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog.Root open title="Modifier">
        <Dialog.Header>
          <Text>Titre</Text>
        </Dialog.Header>
        <Dialog.Panel>
          <Text>Corps</Text>
        </Dialog.Panel>
        <Dialog.Footer>
          <Text>Enregistrer</Text>
        </Dialog.Footer>
      </Dialog.Root>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a dialog opened from inside a drawer panel quiet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Drawer.Root open title="Registres">
        <Text>Corps</Text>
        <Dialog.Root open title="Supprimer">
          <Dialog.Footer>
            <Text>Confirmer</Text>
          </Dialog.Footer>
        </Dialog.Root>
      </Drawer.Root>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a drawer that draws its own header and panel quiet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Drawer.Root open title="Registres">
        <Text>Corps</Text>
      </Drawer.Root>,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
