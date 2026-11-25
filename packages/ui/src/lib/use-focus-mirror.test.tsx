// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFocusServices } from './focus-services';
import { FocusServicesProvider } from './focus-services-context';
import { useFocusMirror } from './use-focus-mirror.hook';

function Control({ focused, label }: Readonly<{ focused: boolean; label: string }>) {
  const mirror = useFocusMirror(focused);
  return <button ref={mirror} type="button" aria-label={label} />;
}

function Row({ at }: Readonly<{ at: number }>) {
  return (
    <>
      <Control focused={at === 0} label="Un" />
      <Control focused={at === 1} label="Deux" />
    </>
  );
}

function services() {
  const owned = createFocusServices();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FocusServicesProvider value={owned}>{children}</FocusServicesProvider>
  );
  return { holder: owned.holder, wrapper };
}

afterEach(cleanup);

describe('useFocusMirror', () => {
  it('hands the document focus to the element while it is focused', () => {
    render(<Control focused label="Un" />);

    expect(document.activeElement).toBe(screen.getByLabelText('Un'));
  });

  it('leaves the document focus alone while it is not', () => {
    render(<Control focused={false} label="Un" />);

    expect(document.activeElement).toBe(document.body);
  });

  it('follows the focus from one element to the next', () => {
    const { rerender } = render(<Row at={0} />);

    rerender(<Row at={1} />);

    expect(document.activeElement).toBe(screen.getByLabelText('Deux'));
  });

  it('holds the focus on the element while it is focused', () => {
    const { holder, wrapper } = services();

    render(<Control focused label="Un" />, { wrapper });

    expect(holder.view()).toBe(screen.getByLabelText('Un'));
  });

  it('drops the focus once it is no longer focused', () => {
    const { holder, wrapper } = services();
    const { rerender } = render(<Control focused label="Un" />, { wrapper });

    rerender(<Control focused={false} label="Un" />);

    expect(holder.view()).toBeNull();
  });

  it('hands the hold to the next element', () => {
    const { holder, wrapper } = services();
    const { rerender } = render(<Row at={0} />, { wrapper });

    rerender(<Row at={1} />);

    expect(holder.view()).toBe(screen.getByLabelText('Deux'));
  });
});
