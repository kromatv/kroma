// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setKeyboardLayoutPref } from '#tv/app/keyboardLayoutPref';
import { EnvProvider } from '#tv/app/providers/env';
import { SearchKeyboard, UrlKeyboard } from '#tv/shared/ui/keyboard';

afterEach(() => {
  cleanup();
  setKeyboardLayoutPref('abc');
});

const show = (ui: ReactElement, physicalKeyboard = false) =>
  render(
    onScreen(
      <EnvProvider platform="TV" overrides={{ physicalKeyboard }}>
        {ui}
      </EnvProvider>,
    ),
  );

describe('SearchKeyboard', () => {
  it('lays the letters out in the order this device saved', () => {
    setKeyboardLayoutPref('qwerty');
    show(<SearchKeyboard value="" onValueChange={vi.fn()} />);
    // A key wears no ring, so the grid's first letter is the one focus scales.
    expect(screen.getByLabelText('Q').style.transform).toContain('scale(1.08)');
    expect(screen.getByLabelText('A').style.transform).not.toContain('scale(1.08)');
  });

  it('opens on A once the device is back on the alphabetical grid', () => {
    show(<SearchKeyboard value="" onValueChange={vi.fn()} />);
    expect(screen.getByLabelText('A').style.transform).toContain('scale(1.08)');
  });

  it('sizes its keys for across the room, not for arm’s length', () => {
    show(<SearchKeyboard value="" onValueChange={vi.fn()} />);
    expect(screen.getByLabelText('A').style.width).toBe('78px');
  });

  it('appends the key that was pressed', () => {
    const onValueChange = vi.fn();
    show(<SearchKeyboard value="ali" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByLabelText('E'));
    expect(onValueChange).toHaveBeenCalledWith('alie');
  });
});

describe('UrlKeyboard', () => {
  it('takes what a keyboard the shell reports types', () => {
    const onValueChange = vi.fn();
    show(<UrlKeyboard value="kroma" onValueChange={onValueChange} />, true);
    fireEvent.keyDown(document, { key: '.' });
    expect(onValueChange).toHaveBeenCalledWith('kroma.');
  });

  it('hears nothing on a remote-only shell, where the keys are the way in', () => {
    const onValueChange = vi.fn();
    show(<UrlKeyboard value="kroma" onValueChange={onValueChange} />);
    fireEvent.keyDown(document, { key: '.' });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
