// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusMirror } from './use-focus-mirror';

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
});
