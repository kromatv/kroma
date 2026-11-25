// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
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

const GENRES = ['Drama', 'Documentary', 'Comedy', 'Crime'];

function Genres(props: Readonly<Omit<TagFieldRootProps, 'label'>>) {
  return (
    <TagField.Root label="Genres" {...props}>
      {GENRES.map((genre) => (
        <TagField.Item key={genre} value={genre} />
      ))}
      <TagField.Empty>No such genre</TagField.Empty>
    </TagField.Root>
  );
}

const entry = () => screen.getByRole('combobox');

const options = () => screen.queryAllByRole('option').map((row) => row.getAttribute('aria-label'));

const tags = () =>
  screen
    .queryAllByLabelText(/^Remove /)
    .map((remove) => remove.getAttribute('aria-label')?.slice(7));

function type(text: string) {
  fireEvent.change(entry(), { target: { value: text } });
}

function key(name: string) {
  fireEvent.keyDown(entry(), { key: name });
}

describe('the suggestions of a <TagField>', () => {
  it('matches the suggestions against what is typed, best first', () => {
    inEnglish(<Genres />);

    type('dr');

    expect(options()).toEqual(['Drama', 'Add “dr”']);
  });

  it('keeps the suggestions as written when a search already matched them', () => {
    inEnglish(<Genres filter={false} />);

    type('dr');

    expect(options()).toEqual([...GENRES, 'Add “dr”']);
  });

  it('leaves out the suggestions already among the tags', () => {
    inEnglish(<Genres defaultValue={['Crime']} />);

    type('c');

    expect(options()).not.toContain('Crime');
  });

  it('makes the first suggestion the active row once something is typed', () => {
    inEnglish(<Genres />);

    type('d');

    const active = entry().getAttribute('aria-activedescendant');
    expect(document.getElementById(active ?? '')?.getAttribute('aria-label')).toBe('Drama');
  });

  it('adds the suggestion the arrows reach on Enter', () => {
    inEnglish(<Genres />);
    type('d');

    key('ArrowDown');
    key('Enter');

    expect(tags()).toEqual(['Documentary']);
  });

  it('adds what is typed once Up lets go of the rows', () => {
    inEnglish(<Genres />);
    type('dra');

    key('ArrowUp');
    key('Enter');

    expect(tags()).toEqual(['dra']);
  });

  it('names no active row once Up lets go of them', () => {
    inEnglish(<Genres />);
    type('dra');

    key('ArrowUp');

    expect(entry().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('adds what is typed on Enter when no suggestion matches it', () => {
    inEnglish(<Genres />);
    type('Western');

    key('Enter');

    expect(tags()).toEqual(['Western']);
  });

  it('adds a suggestion a pointer presses', () => {
    inEnglish(<Genres />);
    type('com');

    fireEvent.click(screen.getByRole('option', { name: 'Comedy' }));

    expect(tags()).toEqual(['Comedy']);
  });

  it('adds the spelling of the suggestion the query names exactly', () => {
    inEnglish(<Genres />);

    type('crime');
    key('Enter');

    expect(tags()).toEqual(['Crime']);
  });

  it('offers to add the typed text when no suggestion names it', () => {
    inEnglish(<Genres />);

    type('Western');

    expect(options()).toEqual(['Add “Western”']);
    expect(screen.getByText('No such genre')).toBeTruthy();
  });

  it('adds the typed text from that row', () => {
    inEnglish(<Genres />);
    type('Western');

    fireEvent.click(screen.getByRole('option', { name: 'Add “Western”' }));

    expect(tags()).toEqual(['Western']);
  });

  it('takes the words of that row from the caller', () => {
    inEnglish(<Genres addLabel={(name) => `New genre: ${name}`} />);

    type('Western');

    expect(options()).toEqual(['New genre: Western']);
  });

  it('offers no such row for a name it already holds', () => {
    inEnglish(<Genres defaultValue={['Western']} />);

    type('western');

    expect(options()).toEqual([]);
  });

  it('says suggestions are on their way while loading', () => {
    inEnglish(<Genres filter={false} loading />);

    type('x');

    expect(screen.getByText('Searching…')).toBeTruthy();
    expect(screen.queryByText('No such genre')).toBeNull();
  });

  it('closes on Escape and keeps what is typed', () => {
    inEnglish(<Genres />);
    type('dr');

    key('Escape');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(entry()).toHaveProperty('value', 'dr');
  });

  it('reopens on Down after Escape', () => {
    inEnglish(<Genres />);
    type('dr');
    key('Escape');

    key('ArrowDown');

    expect(options()).toEqual(['Drama', 'Add “dr”']);
  });

  it('closes on a press outside the field and its list', () => {
    inEnglish(<Genres />);
    type('dr');

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays open on a press on the field itself', () => {
    inEnglish(<Genres />);
    type('dr');

    fireEvent.pointerDown(entry());

    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('draws no list once the field holds max names', () => {
    inEnglish(<Genres defaultValue={['Crime']} max={1} />);

    type('d');

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('the marks of a <TagField>', () => {
  it('gives a tag the mark of the suggestion it was added from', () => {
    inEnglish(
      <TagField.Root label="Directors">
        <TagField.Item value="Denis Villeneuve">
          <TagField.Media />
        </TagField.Item>
      </TagField.Root>,
    );
    type('deni');

    key('Enter');

    expect(tags()).toEqual(['Denis Villeneuve']);
    expect(screen.getAllByText('DV')).toHaveLength(1);
  });

  it('draws the face a written tag declares for its name', () => {
    inEnglish(
      <TagField.Root label="Directors" defaultValue={['Greta Gerwig']}>
        <TagField.Tag value="Greta Gerwig">
          <TagField.Media />
        </TagField.Tag>
      </TagField.Root>,
    );

    expect(screen.getByText('GG')).toBeTruthy();
  });

  it('draws a second line under a suggestion', () => {
    inEnglish(
      <TagField.Root label="Directors" filter={false}>
        <TagField.Item value="Denis Villeneuve">
          <TagField.Hint>Directing · Dune</TagField.Hint>
        </TagField.Item>
      </TagField.Root>,
    );

    type('deni');

    expect(screen.getByText('Directing · Dune')).toBeTruthy();
  });
});
