// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusScope } from '#ui/lib/focus-scope';
import { SearchKeyboard } from './search-keyboard';
import { UrlKeyboard } from './url-keyboard';

afterEach(cleanup);

// space / delete / close, in that order: the tail keys draw a glyph and carry
// no label, so there is no name to find them by.
function tailKeys(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[tabindex]')).slice(-3);
}

describe('SearchKeyboard', () => {
  it('opens the search grid on the first letter, not on the digits row', () => {
    render(
      <FocusScope>
        <SearchKeyboard value="" onValueChange={vi.fn()} letters="qwerty" />
      </FocusScope>,
    );
    // A key wears no ring (see ./key), so the entry is the one the focus scales.
    expect(screen.getByLabelText('Q').style.transform).toContain('scale(1.08)');
    expect(screen.getByLabelText('1').style.transform).not.toContain('scale(1.08)');
  });

  it('appends a lowercase letter', () => {
    const onValueChange = vi.fn();
    render(<SearchKeyboard value="ali" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText('E'));
    expect(onValueChange).toHaveBeenCalledWith('alie');
  });

  it('follows the caller’s letter order rather than a store', () => {
    const { rerender } = render(<SearchKeyboard value="" onValueChange={vi.fn()} letters="abc" />);
    // The ABC grid opens its first row at A; QWERTY opens at Q.
    expect(screen.getAllByLabelText('A')[0]).toBeTruthy();
    rerender(<SearchKeyboard value="" onValueChange={vi.fn()} letters="qwerty" />);
    expect(screen.getAllByLabelText('Q')[0]).toBeTruthy();
  });

  it('is one focus stop per key', () => {
    const { container } = render(<SearchKeyboard value="" onValueChange={vi.fn()} />);
    // The ABC grid: ten digits, twenty-six letters, and space / delete / close.
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(39);
  });

  it('types a space and deletes the last character from the tail row', () => {
    const onValueChange = vi.fn();
    const { container } = render(<SearchKeyboard value="ali" onValueChange={onValueChange} />);
    const [space, del] = tailKeys(container);
    fireEvent.click(space as Element);
    expect(onValueChange).toHaveBeenCalledWith('ali ');
    fireEvent.click(del as Element);
    expect(onValueChange).toHaveBeenCalledWith('al');
  });

  it('closes from the key at the end of the tail row', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SearchKeyboard value="ali" onValueChange={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(tailKeys(container)[2] as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UrlKeyboard', () => {
  it('deletes the last character', () => {
    const onValueChange = vi.fn();
    render(<UrlKeyboard value="kroma" onValueChange={onValueChange} />);
    // The default locale labels it; the key is identified by its glyph role.
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onValueChange).toHaveBeenCalledWith('krom');
  });

  it('appends the key that was pressed, URL specials included', () => {
    const onValueChange = vi.fn();
    render(<UrlKeyboard value="kroma" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText(':'));
    expect(onValueChange).toHaveBeenCalledWith('kroma:');
  });

  it('carries a dot key of its own on the tail row', () => {
    const onValueChange = vi.fn();
    render(<UrlKeyboard value="kroma" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText('.'));
    expect(onValueChange).toHaveBeenCalledWith('kroma.');
  });

  it('empties the whole value from the clear key', () => {
    const onValueChange = vi.fn();
    render(<UrlKeyboard value="kroma.local:4040" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText('Effacer'));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('submits through its own button', () => {
    const onSubmit = vi.fn();
    render(
      <UrlKeyboard
        value="host:4040"
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Connect"
      />,
    );
    fireEvent.click(screen.getByLabelText('Connect'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('drops the submit button when there is nowhere to submit to', () => {
    render(<UrlKeyboard value="" onValueChange={vi.fn()} submitLabel="Connect" />);
    expect(screen.queryByLabelText('Connect')).toBeNull();
  });
});
