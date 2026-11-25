// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '#ui/components/molecules/field';
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

function Actor(props: Readonly<Omit<ComboboxRootProps, 'label'>>) {
  return (
    <Combobox.Root label="Actor" {...props}>
      <Combobox.Item value="Timothée Chalamet" />
      <Combobox.Item value="Tilda Swinton" />
    </Combobox.Root>
  );
}

function Owner() {
  const [name, setName] = useState('Tilda Swinton');
  return <Actor value={name} onValueChange={setName} />;
}

const entry = () => screen.getByRole('combobox');

function type(text: string) {
  fireEvent.change(entry(), { target: { value: text } });
}

function edge(name: string) {
  const well = screen.getByRole('combobox', { name }).parentElement;
  return well === null ? null : getComputedStyle(well).borderTopColor;
}

function ink(name: string) {
  return getComputedStyle(screen.getByRole('combobox', { name })).fontSize;
}

describe('the value of a <Combobox>', () => {
  it('starts from defaultValue', () => {
    inEnglish(<Actor defaultValue="Tilda Swinton" />);

    expect(entry()).toHaveProperty('value', 'Tilda Swinton');
  });

  it('takes what is typed as the value, as it is typed', () => {
    const onValueChange = vi.fn();
    inEnglish(<Actor onValueChange={onValueChange} />);

    type('Someone new ');

    expect(onValueChange).toHaveBeenCalledWith(
      'Someone new ',
      expect.objectContaining({ reason: 'type' }),
    );
    expect(entry()).toHaveProperty('value', 'Someone new ');
  });

  it('asks a controlled caller and waits for the prop to move', () => {
    const onValueChange = vi.fn();
    inEnglish(<Actor value="Tilda Swinton" onValueChange={onValueChange} />);

    type('Tom');

    expect(onValueChange).toHaveBeenCalledWith('Tom', expect.anything());
    expect(entry()).toHaveProperty('value', 'Tilda Swinton');
  });

  it('follows a controlled caller that takes the change', () => {
    inEnglish(<Owner />);

    type('Tom');

    expect(entry()).toHaveProperty('value', 'Tom');
  });

  it('cannot be typed in while disabled', () => {
    inEnglish(<Actor defaultValue="Tom" disabled />);

    expect(entry()).toHaveProperty('readOnly', true);
  });
});

describe('a <Combobox> inside a <Field.Root>', () => {
  it('is named by the label of the Field', () => {
    inEnglish(
      <Field.Root label="Actor">
        <Combobox.Root />
      </Field.Root>,
    );

    expect(screen.getByRole('combobox', { name: 'Actor' })).toBeTruthy();
  });

  it('turns invalid with the error of the Field', () => {
    inEnglish(
      <>
        <Field.Root label="Actor">
          <Combobox.Root />
        </Field.Root>
        <Field.Root label="Director" error="Name someone.">
          <Combobox.Root />
        </Field.Root>
      </>,
    );

    expect(edge('Director')).not.toBe(edge('Actor'));
  });

  it('keeps a label written on it over the label of the Field', () => {
    inEnglish(
      <Field.Root label="Actor">
        <Combobox.Root label="Lead actor" />
      </Field.Root>,
    );

    expect(screen.getByRole('combobox', { name: 'Lead actor' })).toBeTruthy();
  });

  it('is named by its placeholder with no label anywhere', () => {
    inEnglish(<Combobox.Root placeholder="Search for a person" />);

    expect(screen.getByRole('combobox', { name: 'Search for a person' })).toBeTruthy();
  });

  it('takes the size of the Field', () => {
    inEnglish(
      <>
        <Field.Root label="Actor" size="sm">
          <Combobox.Root />
        </Field.Root>
        <Field.Root label="Director" size="tv">
          <Combobox.Root />
        </Field.Root>
      </>,
    );

    expect(ink('Director')).not.toBe(ink('Actor'));
  });
});
