// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Focusable } from './focusable';

afterEach(cleanup);

describe('a focusable with no navigator above it', () => {
  it('renders instead of throwing', () => {
    expect(() => render(<Focusable label="Bubble" autoFocus onPress={() => {}} />)).not.toThrow();
    expect(screen.getByLabelText('Bubble')).toBeTruthy();
  });

  it('still presses', () => {
    const onPress = vi.fn();
    render(<Focusable label="Bubble" onPress={onPress} />);
    fireEvent.click(screen.getByLabelText('Bubble'));
    expect(onPress).toHaveBeenCalled();
  });
});
