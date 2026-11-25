// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope.component';
import { createFocusServices } from '#ui/lib/focus-services';
import { FocusServicesProvider } from '#ui/lib/focus-services-context';
import { createInputTestHost } from '#ui/testing-input';
import { Focusable } from './focusable.component';

const host = createInputTestHost();

afterEach(cleanup);

function services() {
  const owned = createFocusServices(true, host.inputGate);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FocusServicesProvider value={owned}>{children}</FocusServicesProvider>
  );
  return { holder: owned.holder, wrapper };
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('the focus holder of a focusable', () => {
  it('is the element of the control the navigator focused', () => {
    const { holder, wrapper } = services();

    host.render(
      <FocusScope>
        <Focusable label="Un" autoFocus />
      </FocusScope>,
      { wrapper },
    );

    expect(holder.view()).toBe(screen.getByLabelText('Un'));
  });

  it('follows the navigator onto the next control', () => {
    const { holder, wrapper } = services();
    host.render(
      <FocusScope>
        <FocusRegion>
          <Focusable label="Un" autoFocus />
          <Focusable label="Deux" />
        </FocusRegion>
      </FocusScope>,
      { wrapper },
    );

    press('ArrowRight');

    expect(holder.view()).toBe(screen.getByLabelText('Deux'));
  });

  it('is the element of a control the keyboard focused', () => {
    const { holder, wrapper } = services();
    render(<Focusable label="Bulle" />, { wrapper });

    fireEvent.focus(screen.getByLabelText('Bulle'));

    expect(holder.view()).toBe(screen.getByLabelText('Bulle'));
  });

  it('is cleared when that control loses the focus', () => {
    const { holder, wrapper } = services();
    render(<Focusable label="Bulle" />, { wrapper });
    fireEvent.focus(screen.getByLabelText('Bulle'));

    fireEvent.blur(screen.getByLabelText('Bulle'));

    expect(holder.view()).toBeNull();
  });
});
