// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KitProvider } from '#ui/configure';
import { onScreen } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { Combobox, type ComboboxRootProps } from './combobox.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Actor(props: Readonly<Omit<ComboboxRootProps, 'label'>>) {
  return (
    <Combobox.Root label="Actor" placeholder="Search for a person" {...props}>
      <Combobox.Item value="Tilda Swinton">
        <Combobox.Media />
      </Combobox.Item>
      <Combobox.Item value="Tom Hanks" />
    </Combobox.Root>
  );
}

function press(element: HTMLElement) {
  clearPressGuard();
  fireEvent.click(element);
}

const stop = () => screen.getByRole('button', { name: /^Actor/ });

function openDialog() {
  press(stop());
  return screen.getByRole('dialog');
}

describe('a <Combobox> under a D-pad', () => {
  it('is one stop that names the field and the value it holds', () => {
    render(onScreen(<Actor defaultValue="Tom Hanks" />));

    expect(stop().getAttribute('aria-label')).toBe('Actor: Tom Hanks');
  });

  it('is named by its value alone with no label anywhere', () => {
    render(onScreen(<Combobox.Root defaultValue="Tom Hanks" />));

    expect(screen.getByRole('button', { name: 'Tom Hanks' })).toBeTruthy();
  });

  it('reads the placeholder while it holds nothing', () => {
    render(onScreen(<Actor />));

    expect(within(stop()).getByText('Search for a person')).toBeTruthy();
  });

  it('opens its suggestions in a dialog from that stop', () => {
    render(onScreen(<Actor />));

    const dialog = openDialog();

    expect(within(dialog).getByRole('button', { name: 'Tilda Swinton' })).toBeTruthy();
  });

  it('takes the name pressed in the dialog, with its face, and closes', () => {
    render(onScreen(<Actor />));
    const dialog = openDialog();

    press(within(dialog).getByRole('button', { name: 'Tilda Swinton' }));

    expect(stop().getAttribute('aria-label')).toBe('Actor: Tilda Swinton');
    expect(within(stop()).getByText('TS')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('types the value on the keyboard the dialog brings', () => {
    render(onScreen(<Actor />));
    const dialog = openDialog();

    press(within(dialog).getByRole('button', { name: 'H' }));
    press(within(dialog).getByRole('button', { name: 'A' }));

    expect(within(dialog).getByRole('button', { name: 'Tom Hanks' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Tilda Swinton' })).toBeNull();
  });

  it.each([
    ['Tom', 'Tom Hanks'],
    ['Someone new', 'Someone new'],
  ])('takes what the entry names on %s and Enter, and closes', (typed, held) => {
    render(
      onScreen(
        <KitProvider config={{ entry: { physicalKeyboard: true } }}>
          <Actor />
        </KitProvider>,
      ),
    );
    const entry = within(openDialog()).getByRole('textbox');

    fireEvent.change(entry, { target: { value: typed } });
    fireEvent.keyDown(entry, { key: 'Enter' });

    expect(stop().getAttribute('aria-label')).toBe(`Actor: ${held}`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows its value and opens nothing while disabled', () => {
    render(onScreen(<Actor defaultValue="Tom Hanks" disabled />));

    press(stop());

    expect(within(stop()).getByText('Tom Hanks')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
