// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { memo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { ListRow } from '#ui/components/molecules/list-row';
import { Dialog } from '#ui/components/organisms/dialog';
import { KitProvider } from '#ui/configure';
import { onScreen } from '#ui/testing';
import { describeScreen } from './describe-screen';
import { find, focusedPaths, paths } from './inspect.fixtures';

afterEach(cleanup);

function AppCard({ title }: Readonly<{ title: string }>) {
  return <Text>{title}</Text>;
}

const Wrapped = memo(AppCard);

function Settings({ open }: Readonly<{ open: boolean }>) {
  return (
    <Dialog.Root open={open} title="Réglages">
      <ChoiceList.Root label="Serveur" value="plex" onValueChange={vi.fn()}>
        <ChoiceList.Item value="plex">
          <ChoiceList.Label>Plex</ChoiceList.Label>
        </ChoiceList.Item>
      </ChoiceList.Root>
      <Dialog.Footer>
        <Text>Pied</Text>
      </Dialog.Footer>
    </Dialog.Root>
  );
}

describe('the screen as the kit names it', () => {
  it('names compound parts by their part and plain components by their export', () => {
    render(onScreen(<Settings open />));

    const found = paths(describeScreen().nodes);

    expect(found).toContain('KitProvider/I18nProvider/FocusScope/Dialog.Root');
    expect(found).toContainEqual(
      expect.stringMatching(/Dialog\.Root\/.*Dialog\.Footer\/Box\/Text$/),
    );
    expect(found).toContainEqual(
      expect.stringMatching(/Dialog\.Panel\/ChoiceList\.Root\/.*ChoiceList\.Item\/ListRow\.Root\//),
    );
  });

  it('lets an app component and a memo of it through to the kit components inside', () => {
    render(
      onScreen(
        <>
          <AppCard title="Un" />
          <Wrapped title="Deux" />
        </>,
      ),
    );

    const found = paths(describeScreen().nodes);

    expect(found.filter((path) => path.endsWith('FocusScope/Text'))).toHaveLength(2);
    expect(found.join(' ')).not.toMatch(/AppCard|Wrapped/);
  });

  it('keeps what a dialog portals out of the page under the dialog', () => {
    const view = render(onScreen(<Settings open />));

    const dialog = find(describeScreen().nodes, 'Dialog.Root');

    expect(view.container.contains(screen.getByRole('dialog'))).toBe(false);
    expect(paths(dialog?.children ?? [])).toContainEqual(expect.stringMatching(/Dialog\.Footer$/));
  });

  it('reads one tree for two providers on one root', () => {
    render(
      <KitProvider>
        <KitProvider>
          <ListRow.Root onPress={vi.fn()}>
            <ListRow.Label>Langue</ListRow.Label>
          </ListRow.Root>
        </KitProvider>
      </KitProvider>,
    );

    const { nodes } = describeScreen();

    expect(nodes).toHaveLength(1);
    expect(paths(nodes)).toContainEqual(
      expect.stringMatching(/^KitProvider\/KitProvider\/ListRow\.Root\/.*ListRow\.Label$/),
    );
  });

  it('reads one tree per root', () => {
    render(onScreen(<Text>Un</Text>));
    render(onScreen(<Text>Deux</Text>));

    expect(describeScreen().nodes).toHaveLength(2);
  });

  it('reads the tree React committed last', () => {
    const view = render(onScreen(<Settings open={false} />));
    view.rerender(onScreen(<Settings open />));

    const dialog = find(describeScreen().nodes, 'Dialog.Root');

    expect(dialog?.props.open).toBe(true);
  });

  it('forgets a provider once it unmounts', () => {
    const view = render(onScreen(<Text>Un</Text>));
    view.unmount();

    expect(describeScreen().nodes).toEqual([]);
  });

  it('gives each component the box of the first element it draws', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 4, y: 8, width: 120, height: 40 }),
    );
    render(onScreen(<Text>Un</Text>));

    const text = find(describeScreen().nodes, 'Text');

    expect(text?.box).toEqual({ x: 4, y: 8, width: 120, height: 40 });
  });

  it('marks the control the navigator focused, and only that one', () => {
    render(
      onScreen(
        <>
          <Button label="Lire" autoFocus onPress={vi.fn()} />
          <Button label="Plus tard" onPress={vi.fn()} />
        </>,
      ),
    );

    const { nodes } = describeScreen();

    expect(focusedPaths(nodes)).toEqual([expect.stringMatching(/FocusScope\/Button\/Focusable$/)]);
    expect(find(nodes, 'Focusable')?.focused).toBe(true);
  });

  it('counts the fibers it read', () => {
    render(onScreen(<Text>Un</Text>));

    expect(describeScreen().fibers).toBeGreaterThan(3);
  });
});

describe('the global a developer tool calls', () => {
  it('loads the reader on first call and resolves to the same tree', async () => {
    render(onScreen(<Text>Un</Text>));

    const reader: unknown = Reflect.get(globalThis, '__KROMA_UI__');
    const call: unknown = reader && Reflect.get(reader, 'describeScreen');
    const tree: unknown = await act(() => (typeof call === 'function' ? call() : null));

    expect(tree).toEqual(describeScreen());
  });
});
