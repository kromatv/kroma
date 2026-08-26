// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { pinDesignWidth } from '#ui/core';
import { breakpoint } from '#ui/core/tokens';
import { InputGroup } from './input-group';

afterEach(() => {
  cleanup();
  pinDesignWidth();
});

function positionOf(text: string): number {
  const group = screen.getByRole('group');
  const found = [...group.querySelectorAll('*')].findIndex((node) => node.textContent === text);
  return found;
}

describe('<InputGroup>', () => {
  it('names the whole assembly, not the entry inside it', () => {
    render(
      <InputGroup.Root label="Amount">
        <InputGroup.Input placeholder="0.00" physicalKeyboard />
      </InputGroup.Root>,
    );
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Amount');
  });

  it.each([
    ['sm', '13.5px'],
    ['md', '16px'],
  ] as const)('gives the entry the %s shell the group was asked for', (size, fontSize) => {
    // The shell's height, corner and padding all come from the Root, so the
    // entry inside it has to be told the same size or the group is one size
    // and its text another. Off a handset, where the zoom floor would lift the
    // sm ink to 16 and stop it reporting the size.
    pinDesignWidth(breakpoint.md);
    render(
      <InputGroup.Root label="Amount" size={size}>
        <InputGroup.Input placeholder="0.00" physicalKeyboard />
      </InputGroup.Root>,
    );
    expect(screen.getByPlaceholderText('0.00').style.fontSize).toBe(fontSize);
    cleanup();
  });

  it('lays the addons out by `align`, not by the order they were written', () => {
    render(
      <InputGroup.Root label="Amount">
        {/* Deliberately back to front. */}
        <InputGroup.Addon align="inline-end">
          <Text>USD</Text>
        </InputGroup.Addon>
        <InputGroup.Input placeholder="0.00" physicalKeyboard />
        <InputGroup.Addon>
          <Text>$</Text>
        </InputGroup.Addon>
      </InputGroup.Root>,
    );
    expect(positionOf('$')).toBeLessThan(positionOf('USD'));
  });

  it('does not take the focus on mount', () => {
    render(
      <InputGroup.Root label="Image">
        <InputGroup.Input readOnly placeholder="Choisir une image" physicalKeyboard />
      </InputGroup.Root>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it('types into the entry when the padding beside it is pressed', () => {
    render(
      <InputGroup.Root label="Search">
        <InputGroup.Addon>
          <Text>@</Text>
        </InputGroup.Addon>
        <InputGroup.Input placeholder="Search" physicalKeyboard />
      </InputGroup.Root>,
    );
    const entry = screen.getByPlaceholderText('Search');
    expect(document.activeElement).not.toBe(entry);
    fireEvent.click(screen.getByText('@'));
    expect(document.activeElement).toBe(entry);
  });

  it("leaves an addon press of the caller's own working", () => {
    const onPress = vi.fn();
    render(
      <InputGroup.Root label="Search">
        <InputGroup.Input placeholder="Search" physicalKeyboard />
        <InputGroup.Addon align="inline-end" onPress={onPress}>
          <Text>go</Text>
        </InputGroup.Addon>
      </InputGroup.Root>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('pulls the control at the addon edge back into the shell', () => {
    render(
      <InputGroup.Root label="Registry">
        <InputGroup.Input placeholder="https://" physicalKeyboard />
        <InputGroup.Addon align="inline-end">
          <InputGroup.Button label="Test" onPress={() => {}} />
        </InputGroup.Addon>
      </InputGroup.Root>,
    );
    // By the shell's own padding minus the inset, so a ghost button's fill
    // stops exactly where the well does.
    expect(screen.getByLabelText('Test').style.marginRight).toBe('-6px');
  });

  it('refuses a part used outside the Root, rather than rendering something wrong', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <InputGroup.Addon>
          <Text>$</Text>
        </InputGroup.Addon>,
      ),
    ).toThrow(/InputGroup.Addon/);
    quiet.mockRestore();
  });
});
