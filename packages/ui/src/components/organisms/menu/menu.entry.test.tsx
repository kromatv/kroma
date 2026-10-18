// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FocusScope } from '#ui/lib/focus-scope';
import { wearsRing } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { Menu } from './menu';

const { clearPressGuard, render } = createInputTestHost();

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
