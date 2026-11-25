// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { createInputTestHost } from '#ui/testing-input';
import { Combobox, type ComboboxRootProps } from './combobox.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function inEnglish(ui: ReactElement) {
  return render(<I18nProvider locale="en">{ui}</I18nProvider>);
}

const PEOPLE = ['Timothée Chalamet', 'Tilda Swinton', 'Tom Hanks'];

function Actor(props: Readonly<Omit<ComboboxRootProps, 'label'>>) {
  return (
    <Combobox.Root label="Actor" {...props}>
      {PEOPLE.map((name) => (
        <Combobox.Item key={name} value={name}>
          <Combobox.Media />
          <Combobox.Hint>Acting</Combobox.Hint>
        </Combobox.Item>
      ))}
      <Combobox.Empty>No one by that name</Combobox.Empty>
    </Combobox.Root>
  );
}

const entry = () => screen.getByRole('combobox');

const options = () => screen.queryAllByRole('option').map((row) => row.getAttribute('aria-label'));

function type(text: string) {
  fireEvent.change(entry(), { target: { value: text } });
}

function key(name: string) {
  fireEvent.keyDown(entry(), { key: name });
}

function itemAlone() {
  inEnglish(<Combobox.Item value="Tom Hanks" />);
}

describe('the suggestions of a <Combobox>', () => {
  it('opens under the entry as the person types, matched best first', () => {
    inEnglish(<Actor />);

    type('ti');

    expect(options()).toEqual(['Tilda Swinton', 'Timothée Chalamet']);
  });

  it('offers no row to add what is typed, which already is the value', () => {
    inEnglish(<Actor />);

    type('Someone new');

    expect(options()).toEqual([]);
    expect(screen.getByText('No one by that name')).toBeTruthy();
  });

  it('keeps the suggestions as written when a search already matched them', () => {
    inEnglish(<Actor filter={false} />);

    type('x');

    expect(options()).toEqual(PEOPLE);
  });

  it('says suggestions are on their way while loading', () => {
    inEnglish(<Actor filter={false} loading />);

    type('x');

    expect(screen.getByText('Searching…')).toBeTruthy();
  });

  it('picks the active row on Enter, takes its name and closes', () => {
    inEnglish(<Actor />);
    type('tom');

    key('Enter');

    expect(entry()).toHaveProperty('value', 'Tom Hanks');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks the row the arrows reach', () => {
    inEnglish(<Actor />);
    type('ti');

    key('ArrowDown');
    key('Enter');

    expect(entry()).toHaveProperty('value', 'Timothée Chalamet');
  });

  it('keeps what is typed and closes on Enter once Up lets go of the rows', () => {
    inEnglish(<Actor />);
    type('ti');
    key('ArrowUp');

    key('Enter');

    expect(entry()).toHaveProperty('value', 'ti');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks the suggestion a pointer presses', () => {
    inEnglish(<Actor />);
    type('t');

    fireEvent.click(screen.getByRole('option', { name: 'Tilda Swinton' }));

    expect(entry()).toHaveProperty('value', 'Tilda Swinton');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and keeps what is typed', () => {
    inEnglish(<Actor />);
    type('ti');

    key('Escape');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(entry()).toHaveProperty('value', 'ti');
  });

  it('closes on a press outside the entry and its list', () => {
    inEnglish(<Actor />);
    type('ti');

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the name typed when the suggestion it names is disabled', () => {
    inEnglish(
      <Combobox.Root label="Actor">
        <Combobox.Item value="Tom Hanks" disabled>
          <Combobox.Media />
        </Combobox.Item>
      </Combobox.Root>,
    );
    type('Tom Hanks');

    key('Enter');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('TH')).toBeNull();
  });

  it('says where an Item belongs when it is written outside a Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(itemAlone).toThrow('<Combobox.Item> must be used inside <Combobox.Root>');
  });

  it('draws no list while disabled', () => {
    inEnglish(<Actor defaultOpen disabled />);

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('the face of a <Combobox>', () => {
  it('draws the mark of the suggestion picked at the start of the entry', () => {
    inEnglish(<Actor />);
    type('tom');

    key('Enter');

    expect(screen.getByText('TH')).toBeTruthy();
  });

  it('draws the face a written Value declares for the name it holds', () => {
    inEnglish(
      <Combobox.Root label="Actor" defaultValue="Florence Pugh">
        <Combobox.Value value="Austin Butler">
          <Combobox.Media />
        </Combobox.Value>
        <Combobox.Value value="Florence Pugh">
          <Combobox.Media />
        </Combobox.Value>
      </Combobox.Root>,
    );

    expect(screen.getByText('FP')).toBeTruthy();
    expect(screen.queryByText('AB')).toBeNull();
  });

  it('draws no face for a name typed as it is', () => {
    inEnglish(<Actor />);

    type('Tom Hanks Jr');

    expect(screen.queryByText('TH')).toBeNull();
    expect(screen.queryByText('TJ')).toBeNull();
  });

  it('lets the face go once the name is typed over', () => {
    inEnglish(<Actor />);
    type('tom');
    key('Enter');

    type('Thomas');

    expect(screen.queryByText('TH')).toBeNull();
  });
});
