// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { clearPressGuard } from '#ui/lib/press-guard';
import { wearsRing } from '#ui/testing';
import { Menu } from './menu';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('<Menu> in a D-pad dialog', () => {
  it('opens on the first row that can be picked, so OK lands at once', () => {
    const onSelect = vi.fn();
    render(
      <FocusScope>
        <Menu.Root label="Silo" defaultOpen>
          <Menu.Item disabled onSelect={() => {}}>
            Play
          </Menu.Item>
          <Menu.Item onSelect={onSelect}>Add to my list</Menu.Item>
          <Menu.Item onSelect={() => {}}>Report a problem</Menu.Item>
        </Menu.Root>
      </FocusScope>,
    );
    clearPressGuard();

    const ringed = wearsRing(screen.getByLabelText('Add to my list'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(ringed).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
