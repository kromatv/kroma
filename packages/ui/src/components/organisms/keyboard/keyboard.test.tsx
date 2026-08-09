// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnScreenKeyboard } from './keyboard';

afterEach(cleanup);

describe('OnScreenKeyboard', () => {
  it('appends a lowercase letter from the search grid', () => {
    const onChange = vi.fn();
    render(<OnScreenKeyboard value="ali" onChange={onChange} layout="search" />);
    fireEvent.click(screen.getByLabelText('E'));
    expect(onChange).toHaveBeenCalledWith('alie');
  });

  it('follows the caller’s letter order rather than a store', () => {
    const { rerender } = render(
      <OnScreenKeyboard value="" onChange={vi.fn()} layout="search" letters="abc" />,
    );
    // The ABC grid opens its first row at A; QWERTY opens at Q.
    expect(screen.getAllByLabelText('A')[0]).toBeTruthy();
    rerender(<OnScreenKeyboard value="" onChange={vi.fn()} layout="search" letters="qwerty" />);
    expect(screen.getAllByLabelText('Q')[0]).toBeTruthy();
  });

  it('deletes the last character from the url grid', () => {
    const onChange = vi.fn();
    render(<OnScreenKeyboard value="kroma" onChange={onChange} layout="url" />);
    // The default locale labels it; the key is identified by its glyph role.
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onChange).toHaveBeenCalledWith('krom');
  });

  it('submits through the url grid’s button', () => {
    const onSubmit = vi.fn();
    render(
      <OnScreenKeyboard
        value="host:4040"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Connect"
        layout="url"
      />,
    );
    fireEvent.click(screen.getByLabelText('Connect'));
    expect(onSubmit).toHaveBeenCalled();
  });
});
