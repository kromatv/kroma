// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from '#ui/components/molecules/field';
import { I18nProvider } from '#ui/services/i18n';
import { createInputTestHost } from '#ui/testing-input';
import { TagField, type TagFieldRootProps } from './tag-field.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function inEnglish(ui: ReactElement) {
  return render(<I18nProvider locale="en">{ui}</I18nProvider>);
}

function Names(props: Readonly<Omit<TagFieldRootProps, 'label'>>) {
  return <TagField.Root label="Genres" defaultValue={['Drama']} {...props} />;
}

const entry = () => screen.getByRole('combobox');

const tags = () =>
  screen
    .queryAllByLabelText(/^Remove /)
    .map((remove) => remove.getAttribute('aria-label')?.slice(7));

function edge(name: string) {
  const well = screen.getByRole('combobox', { name }).parentElement;
  return well === null ? null : getComputedStyle(well).borderTopColor;
}

function type(text: string) {
  fireEvent.change(entry(), { target: { value: text } });
}

function key(name: string) {
  fireEvent.keyDown(entry(), { key: name });
}

describe('adding names to a <TagField>', () => {
  it('adds what is typed on Enter and empties the entry', () => {
    inEnglish(<Names />);

    type('Thriller');
    key('Enter');

    expect(tags()).toEqual(['Drama', 'Thriller']);
    expect(entry()).toHaveProperty('value', '');
  });

  it('adds a name as soon as a comma closes it', () => {
    inEnglish(<Names />);
    type('Horror');

    type('Horror,');

    expect(tags()).toEqual(['Drama', 'Horror']);
    expect(entry()).toHaveProperty('value', '');
  });

  it('keeps what follows the comma as the next name being typed', () => {
    inEnglish(<Names />);
    type('Horror');

    type('Horror,');
    type(' C');

    expect(entry()).toHaveProperty('value', 'C');
  });

  it('adds every name of a pasted list', () => {
    inEnglish(<Names />);

    type('Action, Comedy,  Crime');

    expect(tags()).toEqual(['Drama', 'Action', 'Comedy', 'Crime']);
  });

  it('ignores a name it already holds, whatever its case and accents', () => {
    inEnglish(<Names defaultValue={['Comédie']} />);

    type('comedie, COMÉDIE,');

    expect(tags()).toEqual(['Comédie']);
  });

  it('stops adding at max', () => {
    inEnglish(<Names max={2} />);

    type('Action, Comedy, Crime');

    expect(tags()).toEqual(['Drama', 'Action']);
  });

  it('adds nothing for an empty entry', () => {
    inEnglish(<Names />);

    type('   ');
    key('Enter');

    expect(tags()).toEqual(['Drama']);
  });
});

describe('taking names out of a <TagField>', () => {
  it('takes the last tag out on Backspace in an empty entry', () => {
    inEnglish(<Names defaultValue={['Drama', 'Crime']} />);

    key('Backspace');

    expect(tags()).toEqual(['Drama']);
  });

  it('leaves the tags alone on Backspace while something is typed', () => {
    inEnglish(<Names />);
    type('Cri');

    key('Backspace');

    expect(tags()).toEqual(['Drama']);
  });

  it('takes a tag out from its remove control, named after the tag', () => {
    inEnglish(<Names defaultValue={['Drama', 'Crime']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Drama' }));

    expect(tags()).toEqual(['Crime']);
  });

  it('draws no remove control on a disabled field', () => {
    inEnglish(<Names disabled />);

    expect(tags()).toEqual([]);
    expect(screen.getByText('Drama')).toBeTruthy();
  });
});

describe('a <TagField> inside a <Field.Root>', () => {
  it('is named by the label of the Field', () => {
    inEnglish(
      <Field.Root label="Genres">
        <TagField.Root />
      </Field.Root>,
    );

    expect(screen.getByRole('combobox', { name: 'Genres' })).toBeTruthy();
  });

  it('turns invalid with the error of the Field', () => {
    inEnglish(
      <>
        <Field.Root label="Genres">
          <TagField.Root />
        </Field.Root>
        <Field.Root label="Studios" error="Pick one studio at least.">
          <TagField.Root />
        </Field.Root>
      </>,
    );

    expect(edge('Studios')).not.toBe(edge('Genres'));
  });

  it('keeps a label written on it over the label of the Field', () => {
    inEnglish(
      <Field.Root label="Genres">
        <TagField.Root label="Film genres" />
      </Field.Root>,
    );

    expect(screen.getByRole('combobox', { name: 'Film genres' })).toBeTruthy();
  });

  it('is named by its placeholder with no label anywhere', () => {
    inEnglish(<TagField.Root placeholder="Add a genre" />);

    expect(screen.getByRole('combobox', { name: 'Add a genre' })).toBeTruthy();
  });
});
