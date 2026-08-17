// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusScope } from '#ui/lib/focus-scope';
import { SearchKeyboard } from './search-keyboard';
import { UrlKeyboard } from './url-keyboard';

afterEach(cleanup);

function blurLayers(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('*')].filter((el) =>
    /blur/.test((el as HTMLElement).style.backdropFilter),
  );
}

describe('ten-foot keyboard blur', () => {
  it('frosts each key at arm’s length but never on a television', () => {
    const armsLength = render(<SearchKeyboard value="" onValueChange={vi.fn()} size="sm" />);
    expect(blurLayers(armsLength.container).length).toBeGreaterThan(0);
    cleanup();
    const tv = render(<SearchKeyboard value="" onValueChange={vi.fn()} size="tv" />);
    expect(blurLayers(tv.container)).toHaveLength(0);
  });

  it('lays no blur under the URL grid on a television either', () => {
    const { container } = render(<UrlKeyboard value="" onValueChange={vi.fn()} size="tv" />);
    expect(blurLayers(container)).toHaveLength(0);
  });
});

// space / delete / close, in that order. A glyph key draws no words, so its
// label is its accessible name alone - which is how a test finds it.
function tailKeys(): Element[] {
  return ['Espace', 'Supprimer', 'Fermer'].map((name) => screen.getByLabelText(name));
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
    render(<SearchKeyboard value="ali" onValueChange={onValueChange} />);
    const [space, del] = tailKeys();
    fireEvent.click(space as Element);
    expect(onValueChange).toHaveBeenCalledWith('ali ');
    fireEvent.click(del as Element);
    expect(onValueChange).toHaveBeenCalledWith('al');
  });

  it('closes from the key at the end of the tail row', () => {
    const onClose = vi.fn();
    render(<SearchKeyboard value="ali" onValueChange={vi.fn()} onClose={onClose} />);
    fireEvent.click(tailKeys()[2] as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UrlKeyboard', () => {
  // The editing keys carry the default locale's labels; the rest are their glyph.
  it.each([
    ['deletes the last character', 'kroma', 'Supprimer', 'krom'],
    ['appends the key that was pressed, URL specials included', 'kroma', ':', 'kroma:'],
    ['carries a dot key of its own on the tail row', 'kroma', '.', 'kroma.'],
    ['empties the whole value from the clear key', 'kroma.local:4040', 'Effacer', ''],
  ])('%s', (_what, value, key, next) => {
    const onValueChange = vi.fn();
    render(<UrlKeyboard value={value} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText(key));
    expect(onValueChange).toHaveBeenCalledWith(next);
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
