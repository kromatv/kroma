// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { CONTROL } from '#ui/lib/field-shell';
import { ListRow } from './list-row';

afterEach(cleanup);

const rowOf = (container: HTMLElement, name: string) =>
  container.querySelector(`[aria-label="${name}"]`) as HTMLElement;

describe('ListRow', () => {
  it('is a namespace of parts, not a component', () => {
    expect(typeof ListRow).toBe('object');
    expect(Object.keys(ListRow).sort()).toEqual([
      'Group',
      'Hint',
      'Label',
      'Leading',
      'Root',
      'Trailing',
    ]);
  });

  it('names itself from a plain-text label part', () => {
    render(
      <ListRow.Root onPress={vi.fn()}>
        <ListRow.Label>Maxime</ListRow.Label>
      </ListRow.Root>,
    );
    expect(screen.getByLabelText('Maxime')).toBeTruthy();
  });

  it('reads the name through a wrapper the middle column puts around the label', () => {
    render(
      <ListRow.Root onPress={vi.fn()}>
        <Text>
          <ListRow.Label>Maxime</ListRow.Label>
        </Text>
      </ListRow.Root>,
    );
    expect(screen.getByLabelText('Maxime')).toBeTruthy();
  });

  it('takes the name a row whose middle column says nothing in plain text was given', () => {
    render(
      <ListRow.Root label="Maxime" onPress={vi.fn()}>
        <ListRow.Label>
          <Text />
        </ListRow.Label>
      </ListRow.Root>,
    );
    expect(screen.getByLabelText('Maxime')).toBeTruthy();
  });

  it('sorts the head and the tail out of any order, keeping the middle as written', () => {
    const { container } = render(
      <ListRow.Root>
        <ListRow.Trailing>
          <Text>tail</Text>
        </ListRow.Trailing>
        <ListRow.Label>label</ListRow.Label>
        <ListRow.Hint>hint</ListRow.Hint>
        <ListRow.Leading>
          <Text>head</Text>
        </ListRow.Leading>
      </ListRow.Root>,
    );
    expect(container.textContent).toBe('headlabelhinttail');
  });

  it('draws a chevron only where the row leads somewhere', () => {
    const { container: still } = render(
      <ListRow.Root>
        <ListRow.Label>Version</ListRow.Label>
        <ListRow.Hint>1.2.3</ListRow.Hint>
      </ListRow.Root>,
    );
    expect(still.querySelector('svg')).toBeNull();

    cleanup();
    const { container: leads } = render(
      <ListRow.Root onPress={vi.fn()}>
        <ListRow.Label>Langue</ListRow.Label>
      </ListRow.Root>,
    );
    expect(leads.querySelector('svg')).toBeTruthy();
  });

  it('gives the tail slot to a trailing part rather than to the chevron', () => {
    const { container } = render(
      <ListRow.Root onPress={vi.fn()}>
        <ListRow.Label>Audio</ListRow.Label>
        <ListRow.Trailing>
          <Text>Français</Text>
        </ListRow.Trailing>
      </ListRow.Root>,
    );
    expect(container.textContent).toBe('AudioFrançais');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('takes its shape from the control shell', () => {
    const { container } = render(
      <>
        <ListRow.Root size="sm">
          <ListRow.Label>Petite</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root size="md">
          <ListRow.Label>Moyenne</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root size="tv">
          <ListRow.Label>Télé</ListRow.Label>
        </ListRow.Root>
      </>,
    );
    expect(getComputedStyle(rowOf(container, 'Petite')).minHeight).toBe(`${CONTROL.sm.height}px`);
    expect(getComputedStyle(rowOf(container, 'Moyenne')).minHeight).toBe(`${CONTROL.md.height}px`);
    expect(getComputedStyle(rowOf(container, 'Télé')).minHeight).toBe(`${CONTROL.tv.height}px`);
  });

  it('is one focus stop, whatever the parts hold', () => {
    const { container } = render(
      <ListRow.Root onPress={vi.fn()}>
        <ListRow.Label>Nivellement</ListRow.Label>
        <ListRow.Trailing>
          <Text>on</Text>
        </ListRow.Trailing>
      </ListRow.Root>,
    );
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(1);
  });

  it('refuses a part written outside a row', () => {
    expect(() => render(<ListRow.Label>Orpheline</ListRow.Label>)).toThrow(
      '<ListRow.Label> must be used inside <ListRow.Root>',
    );
  });

  it('keeps the icon when an optional Leading turned out empty', () => {
    const absent = undefined;
    const { container } = render(
      <ListRow.Root icon="settings">
        <ListRow.Leading>{absent}</ListRow.Leading>
        <ListRow.Label>Qualité</ListRow.Label>
      </ListRow.Root>,
    );
    expect(container.querySelector('.tabler-icon-settings')).toBeTruthy();
  });

  it('draws no chevron on a row that acts in place', () => {
    const { container } = render(
      <ListRow.Root chevron={false} onPress={vi.fn()}>
        <ListRow.Label>Francais</ListRow.Label>
      </ListRow.Root>,
    );
    expect(container.querySelector('.tabler-icon-chevron-right')).toBeNull();
  });

  it('draws a chevron on a pressable row that goes somewhere', () => {
    const { container } = render(
      <ListRow.Root onPress={vi.fn()}>
        <ListRow.Label>Comptes</ListRow.Label>
      </ListRow.Root>,
    );
    expect(container.querySelector('.tabler-icon-chevron-right')).toBeTruthy();
  });

  it('does not announce a display row as a button it cannot activate', () => {
    render(
      <ListRow.Root>
        <ListRow.Label>Version</ListRow.Label>
        <ListRow.Hint>0.1.36</ListRow.Hint>
      </ListRow.Root>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is still a button when it presses, and a link when it links', () => {
    render(
      <>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>Comptes</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root href="https://kroma.tv">
          <ListRow.Label>Notes</ListRow.Label>
        </ListRow.Root>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Comptes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Notes' })).toBeTruthy();
  });

  it('paints the row the list is about, not only announcing it', () => {
    const { container } = render(
      <>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>Hier</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root selected onPress={vi.fn()}>
          <ListRow.Label>Aujourd'hui</ListRow.Label>
        </ListRow.Root>
      </>,
    );
    const [plain, picked] = [rowOf(container, 'Hier'), rowOf(container, "Aujourd'hui")];
    expect(getComputedStyle(picked).backgroundColor).not.toBe(
      getComputedStyle(plain).backgroundColor,
    );
  });

  it('lets a long tail truncate only when the tail says it may', () => {
    const tail = (node: HTMLElement, value: string): CSSStyleDeclaration => {
      // Innermost first: the outermost match is the tail box itself, whose own
      // parent is the row.
      const text = Array.from(node.querySelectorAll('div'))
        .reverse()
        .find((el) => el.textContent === value);
      if (!text?.parentElement) throw new Error(`no tail holding ${value}`);
      return getComputedStyle(text.parentElement);
    };

    const fixed = render(
      <ListRow.Root>
        <ListRow.Label>Fixe</ListRow.Label>
        <ListRow.Trailing>
          <Text>on</Text>
        </ListRow.Trailing>
      </ListRow.Root>,
    ).container;
    const supple = render(
      <ListRow.Root>
        <ListRow.Label>Souple</ListRow.Label>
        <ListRow.Trailing shrink>
          <Text>a very long value indeed</Text>
        </ListRow.Trailing>
      </ListRow.Root>,
    ).container;

    expect(tail(fixed, 'on').flexShrink).toBe('0');
    expect(tail(supple, 'a very long value indeed').flexShrink).toBe('1');
  });
});
