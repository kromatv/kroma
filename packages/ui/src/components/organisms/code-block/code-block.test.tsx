// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from './code-block';

beforeEach(() => {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(cleanup);

const SNIPPET = '<Button label="Play" />\n\nconst play = () => undefined;';

describe('<CodeBlock>', () => {
  it('paints a token per run rather than one string, so a theme swap reaches it', () => {
    render(<CodeBlock code={'const a = 1;'} />);
    expect(screen.getByText('const')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('numbers anything longer than one line, and nothing shorter', () => {
    const { rerender } = render(<CodeBlock code={SNIPPET} />);
    expect(screen.getByText('1')).toBeTruthy();
    // The blank line in the middle keeps a row of its own, numbered with the
    // rest: a snippet is read against the file it came from.
    expect(screen.getByText('3')).toBeTruthy();
    rerender(<CodeBlock code={'<Button />'} />);
    expect(screen.queryByText('1')).toBeNull();
  });

  it('takes the numbers off, and puts them on a single line, when asked', () => {
    const { rerender } = render(<CodeBlock code={SNIPPET} numbers={false} />);
    expect(screen.queryByText('2')).toBeNull();
    rerender(<CodeBlock code={'<Button />'} numbers />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('pads the gutter to the width of the last number, so the code never steps sideways', () => {
    render(<CodeBlock code={Array.from({ length: 10 }, (_, at) => `line${at}`).join('\n')} />);
    const asWritten = { normalizer: (text: string) => text };
    expect(screen.getByText(' 1', asWritten)).toBeTruthy();
    expect(screen.getByText('10', asWritten)).toBeTruthy();
  });

  it('trims the snippet before it is painted', () => {
    render(<CodeBlock code={'\n\n  <Button />\n\n'} />);
    expect(screen.queryByText('2')).toBeNull();
  });

  it('offers the trimmed snippet to the clipboard', async () => {
    render(<CodeBlock code={`\n${SNIPPET}\n`} />);
    fireEvent.click(await screen.findByLabelText('Copier le code'));
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(SNIPPET);
  });

  it('offers no copy control where the platform has no clipboard', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<CodeBlock code={SNIPPET} />);
    await vi.waitFor(() => expect(screen.queryByLabelText('Copier le code')).toBeNull());
  });
});
