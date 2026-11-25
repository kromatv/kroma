// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KitProvider } from '#ui/configure';
import { onScreen } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { TagField, type TagFieldRootProps } from './tag-field.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Genres(props: Readonly<Omit<TagFieldRootProps, 'label'>>) {
  return (
    <TagField.Root label="Genres" defaultValue={['Drama']} {...props}>
      <TagField.Item value="Drama" />
      <TagField.Item value="Crime" />
      <TagField.Item value="Comedy" />
    </TagField.Root>
  );
}

const tags = () =>
  screen
    .queryAllByLabelText(/^Remove /)
    .map((remove) => remove.getAttribute('aria-label')?.slice(7));

function press(element: HTMLElement) {
  clearPressGuard();
  fireEvent.click(element);
}

function openDialog() {
  press(screen.getByRole('button', { name: 'Genres' }));
  return screen.getByRole('dialog');
}

describe('a <TagField> under a D-pad', () => {
  it('makes each tag a stop whose press takes it out', () => {
    render(onScreen(<Genres defaultValue={['Drama', 'Crime']} />));

    press(screen.getByRole('button', { name: 'Remove Drama' }));

    expect(tags()).toEqual(['Crime']);
  });

  it('opens its suggestions in a dialog from the stop after the tags', () => {
    render(onScreen(<Genres />));

    const dialog = openDialog();

    expect(within(dialog).getByRole('button', { name: 'Crime' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Drama' })).toBeNull();
  });

  it('adds the suggestion pressed in the dialog and closes it', () => {
    render(onScreen(<Genres />));
    const dialog = openDialog();

    press(within(dialog).getByRole('button', { name: 'Comedy' }));

    expect(tags()).toEqual(['Drama', 'Comedy']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('types the query on the keyboard the dialog brings', () => {
    render(onScreen(<Genres />));
    const dialog = openDialog();

    press(within(dialog).getByRole('button', { name: 'C' }));
    press(within(dialog).getByRole('button', { name: 'R' }));

    expect(within(dialog).getByRole('button', { name: 'Crime' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Comedy' })).toBeNull();
  });

  it.each([
    ['Crime', ['Drama', 'Crime']],
    ['Co', ['Drama', 'Comedy']],
    ['Western', ['Drama', 'Western']],
  ])('adds what the entry names on %s and Enter, and closes', (query, held) => {
    render(
      onScreen(
        <KitProvider config={{ entry: { physicalKeyboard: true } }}>
          <Genres />
        </KitProvider>,
      ),
    );
    const entry = within(openDialog()).getByRole('textbox');

    fireEvent.change(entry, { target: { value: query } });
    fireEvent.keyDown(entry, { key: 'Enter' });

    expect(tags()).toEqual(held);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no stop to add once the field holds max names', () => {
    render(onScreen(<Genres max={1} />));

    expect(screen.queryByRole('button', { name: 'Genres' })).toBeNull();
  });
});
