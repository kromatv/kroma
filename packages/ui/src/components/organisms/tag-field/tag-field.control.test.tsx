// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import { act } from '#ui/lib/inspect';
import { I18nProvider } from '#ui/services/i18n';
import { createInputTestHost } from '#ui/testing-input';
import type { TagFieldDetails } from './tag-field-context';
import { TagField, type TagFieldRootProps } from './tag-field.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Names(props: Readonly<Omit<TagFieldRootProps, 'label'>>) {
  return (
    <I18nProvider locale="en">
      <TagField.Root label="Genres" {...props}>
        <TagField.Item value="Drama" />
        <TagField.Item value="Crime" />
      </TagField.Root>
    </I18nProvider>
  );
}

function Owner() {
  const [names, setNames] = useState<string[]>([]);
  return <Names value={names} onValueChange={setNames} />;
}

const entry = () => screen.getByRole('combobox');

const tags = () =>
  screen
    .queryAllByLabelText(/^Remove /)
    .map((remove) => remove.getAttribute('aria-label')?.slice(7));

function add(text: string) {
  fireEvent.change(entry(), { target: { value: text } });
  fireEvent.keyDown(entry(), { key: 'Enter' });
}

const refuse = (_next: readonly string[], details: TagFieldDetails) => details.cancel();

describe('the value of a <TagField>', () => {
  it('runs itself from defaultValue', () => {
    render(<Names defaultValue={['Crime']} />);

    add('Drama');

    expect(tags()).toEqual(['Crime', 'Drama']);
  });

  it('asks a controlled caller and waits for the prop to move', () => {
    const onValueChange = vi.fn();
    render(<Names value={['Crime']} onValueChange={onValueChange} />);

    add('Drama');

    expect(onValueChange).toHaveBeenCalledWith(['Crime', 'Drama'], expect.anything());
    expect(tags()).toEqual(['Crime']);
  });

  it('follows a controlled caller that takes the change', () => {
    render(<Owner />);

    add('Drama');

    expect(tags()).toEqual(['Drama']);
  });

  it('says which action moved the value', () => {
    const onValueChange = vi.fn();
    render(<Names defaultValue={['Crime']} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Crime' }));

    expect(onValueChange).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ reason: 'remove', source: 'user' }),
    );
  });

  it('keeps the value when the app cancels the change', () => {
    render(<Names defaultValue={['Crime']} onValueChange={refuse} />);

    add('Drama');

    expect(tags()).toEqual(['Crime']);
  });

  it('hands a controlled query to the caller as it is typed', () => {
    const onQueryChange = vi.fn();
    render(<Names query="" onQueryChange={onQueryChange} />);

    fireEvent.change(entry(), { target: { value: 'dr' } });

    expect(onQueryChange).toHaveBeenCalledWith('dr', expect.objectContaining({ reason: 'type' }));
    expect(entry()).toHaveProperty('value', '');
  });

  it('tells the app why the suggestions closed', () => {
    const onOpenChange = vi.fn();
    render(<Names onOpenChange={onOpenChange} />);
    fireEvent.change(entry(), { target: { value: 'dr' } });

    fireEvent.keyDown(entry(), { key: 'Escape' });

    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'escape' }),
    );
  });

  it('takes a name a developer tool adds, and says who added it', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const onValueChange = vi.fn();
    render(
      <KitProvider>
        <Names onValueChange={onValueChange} />
      </KitProvider>,
    );

    await act({ steps: [{ ref: 'c1', action: 'add', args: ['Crime'] }] });

    expect(tags()).toEqual(['Crime']);
    expect(onValueChange).toHaveBeenCalledWith(
      ['Crime'],
      expect.objectContaining({ reason: 'add', source: 'tool' }),
    );
  });
});
