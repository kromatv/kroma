// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from '#ui/components/molecules/select';
import { setEntryDefaults } from '#ui/lib/field-shell';
import { onScreen } from '#ui/testing';
import { Field } from './field';

// The browser half of the kit: a shell with a real keyboard says so once.
setEntryDefaults({ physicalKeyboard: true });

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

const edge = (label: string) =>
  getComputedStyle(screen.getByLabelText(label).parentElement as Element).borderColor;

describe('Field.Root with no children', () => {
  it('renders the entry itself, named by the label', () => {
    render(<Field.Root label="Server address" defaultValue="kroma.local:4040" />);
    const entry = screen.getByLabelText('Server address') as HTMLInputElement;
    expect(entry.tagName).toBe('INPUT');
    expect(entry.value).toBe('kroma.local:4040');
    expect(screen.getByText('Server address')).toBeTruthy();
  });

  it('keeps the label as the accessible name when the row is hidden', () => {
    render(<Field.Root label="Search" hideLabel />);
    expect(screen.getByLabelText('Search')).toBeTruthy();
    expect(screen.queryByText('Search')).toBeNull();
  });
});

describe('the value the Root holds', () => {
  it('reaches the entry it renders, and reports what is typed', () => {
    const onValueChange = vi.fn();
    render(
      <Field.Root label="Name" value="Living room" onValueChange={onValueChange}>
        <Field.Input />
      </Field.Root>,
    );
    const entry = screen.getByLabelText('Name') as HTMLInputElement;
    expect(entry.value).toBe('Living room');
    fireEvent.change(entry, { target: { value: 'Kitchen' } });
    expect(onValueChange).toHaveBeenCalledWith('Kitchen');
  });

  it('gives way to a part that declares its own', () => {
    const onValueChange = vi.fn();
    const root = vi.fn();
    render(
      <Field.Root label="Name" value="Living room" onValueChange={root}>
        <Field.Input value="Kitchen" onValueChange={onValueChange} />
      </Field.Root>,
    );
    const entry = screen.getByLabelText('Name') as HTMLInputElement;
    expect(entry.value).toBe('Kitchen');
    fireEvent.change(entry, { target: { value: 'Cellar' } });
    expect(onValueChange).toHaveBeenCalledWith('Cellar');
    expect(root).not.toHaveBeenCalled();
  });
});

describe('Field.Textarea', () => {
  it('is a real multi-line entry, named by the field', () => {
    render(
      <Field.Root label="Message">
        <Field.Textarea rows={3} />
      </Field.Root>,
    );
    const entry = screen.getByLabelText('Message');
    expect(entry.tagName).toBe('TEXTAREA');
    // `rows` is a floor in the kit's own line box, not a DOM rows attribute.
    expect(getComputedStyle(entry).minHeight).toBe('72px');
  });
});

describe('the note under the control', () => {
  it('shows the hint it was written', () => {
    render(
      <Field.Root label="Port">
        <Field.Hint>4040 by default.</Field.Hint>
      </Field.Root>,
    );
    expect(screen.getByText('4040 by default.')).toBeTruthy();
  });

  it('replaces the hint with the error rather than stacking both', () => {
    render(
      <Field.Root label="Port" error="The server did not answer.">
        <Field.Input />
        <Field.Hint>4040 by default.</Field.Hint>
      </Field.Root>,
    );
    expect(screen.getByText('The server did not answer.')).toBeTruthy();
    expect(screen.queryByText('4040 by default.')).toBeNull();
  });

  it('speaks even when the field carries no hint at all', () => {
    render(<Field.Root label="Port" error="The server did not answer." />);
    expect(screen.getByText('The server did not answer.')).toBeTruthy();
  });

  it('renders under the control, wherever it was written', () => {
    render(
      <Field.Root label="Port">
        <Field.Hint>4040 by default.</Field.Hint>
        <Field.Input />
      </Field.Root>,
    );
    const note = screen.getByText('4040 by default.');
    const entry = screen.getByLabelText('Port');
    const after = entry.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after).toBeTruthy();
  });
});

describe('an invalid field', () => {
  it('tints the entry the Root renders', () => {
    render(<Field.Root label="Port" />);
    const valid = edge('Port');
    cleanup();
    render(<Field.Root label="Port" error="The server did not answer." />);
    expect(edge('Port')).not.toBe(valid);
  });

  it('reads an empty error as no error at all', () => {
    render(<Field.Root label="Port" />);
    const valid = edge('Port');
    cleanup();
    render(
      <Field.Root label="Port" error="">
        <Field.Hint>4040 by default.</Field.Hint>
      </Field.Root>,
    );
    expect(edge('Port')).toBe(valid);
    expect(screen.getByText('4040 by default.')).toBeTruthy();
  });
});

describe('a control that is not a text entry', () => {
  it('keeps the label row and the note for itself', () => {
    render(
      <Field.Root label="Category">
        <Select.Root label="Category" defaultValue="system">
          <Select.Trigger />
          <Select.Item value="system">Server status</Select.Item>
        </Select.Root>
        <Field.Hint>Where the alert lands.</Field.Hint>
      </Field.Root>,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Where the alert lands.')).toBeTruthy();
  });
});

describe('a part outside its Root', () => {
  it('says which part is misplaced', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Field.Hint>4040 by default.</Field.Hint>)).toThrow(
      '<Field.Hint> must be used inside <Field.Root>',
    );
    quiet.mockRestore();
  });
});
