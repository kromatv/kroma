// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OtpField } from './otp-field';

afterEach(cleanup);

const row = (container: HTMLElement) => container.firstElementChild as HTMLElement;
const entry = (container: HTMLElement) =>
  container.querySelector('input') as HTMLInputElement | null;

function type(container: HTMLElement, text: string) {
  const input = entry(container);
  if (!input) throw new Error('no entry mounted');
  fireEvent.change(input, { target: { value: text } });
}

describe('OtpField', () => {
  it('is a namespace of parts, not a component', () => {
    expect(typeof OtpField).toBe('object');
    expect(Object.keys(OtpField).sort()).toEqual(['Group', 'Root', 'Separator', 'Slot']);
  });

  it('renders the same row from the sugar and from the parts', () => {
    const { container: sugar } = render(
      <OtpField.Root maxLength={4} groups={[2, 2]} defaultValue="12" />,
    );
    const written = sugar.innerHTML;

    cleanup();
    const { container: parts } = render(
      <OtpField.Root maxLength={4} defaultValue="12">
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
        <OtpField.Separator />
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
      </OtpField.Root>,
    );
    expect(parts.innerHTML).toBe(written);
  });

  it('gives a slot its place in the code from where it sits, across groups', () => {
    const { container } = render(
      <OtpField.Root maxLength={4} defaultValue="ABC">
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
        <OtpField.Separator />
        <OtpField.Group>
          <OtpField.Slot />
          <OtpField.Slot />
        </OtpField.Group>
      </OtpField.Root>,
    );
    expect(container.textContent).toBe('ABC');
  });

  it('breaks the row into groups only where the sugar asks', () => {
    const { container: one } = render(<OtpField.Root maxLength={6} />);
    expect(row(one).children).toHaveLength(1);

    cleanup();
    const { container: split } = render(<OtpField.Root maxLength={6} groups={[3, 3]} />);
    expect(row(split).children).toHaveLength(3);
  });

  it('masks the characters without changing the code it holds', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OtpField.Root maxLength={4} mask physicalKeyboard onValueChange={onValueChange} />,
    );
    type(container, '1234');
    expect(onValueChange).toHaveBeenCalledWith('1234');
    expect(container.textContent).toBe('••••');
  });

  it('flows a pasted code across every slot, dropping what the pattern refuses', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OtpField.Root
        maxLength={6}
        groups={[3, 3]}
        physicalKeyboard
        onValueChange={onValueChange}
      />,
    );
    type(container, '12 34-56');
    expect(onValueChange).toHaveBeenCalledWith('123456');
    expect(container.textContent).toBe('123456');
  });

  it('keeps every slot a face, so the whole row stays one control', () => {
    const { container } = render(<OtpField.Root maxLength={6} groups={[3, 3]} physicalKeyboard />);
    const faces = Array.from(row(container).children).slice(2) as HTMLElement[];
    expect(faces).toHaveLength(3);
    for (const face of faces) expect(getComputedStyle(face).pointerEvents).toBe('none');
  });

  it('names the whole field once, on the entry that owns the text', () => {
    render(<OtpField.Root maxLength={4} physicalKeyboard label="Code PIN" />);
    expect(screen.getAllByLabelText('Code PIN')).toHaveLength(1);
  });

  it('mounts no entry at all where there is no keyboard', () => {
    const { container } = render(<OtpField.Root maxLength={4} />);
    expect(entry(container)).toBeNull();
  });

  it('reports a complete code once, and again only after it drops below full', () => {
    const onComplete = vi.fn();
    const view = render(<OtpField.Root maxLength={4} value="123" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();

    view.rerender(<OtpField.Root maxLength={4} value="1234" onComplete={onComplete} />);
    view.rerender(<OtpField.Root maxLength={4} value="1234" onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');

    view.rerender(<OtpField.Root maxLength={4} value="123" onComplete={onComplete} />);
    view.rerender(<OtpField.Root maxLength={4} value="1234" onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('takes no keystroke while it is disabled', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OtpField.Root maxLength={4} disabled physicalKeyboard onValueChange={onValueChange} />,
    );
    type(container, '12');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('refuses a part written outside a root', () => {
    expect(() =>
      render(
        <OtpField.Group>
          <OtpField.Slot />
        </OtpField.Group>,
      ),
    ).toThrow('<OtpField.Group> must be used inside <OtpField.Root>');
  });

  it('refuses a slot written outside a group', () => {
    expect(() =>
      render(
        <OtpField.Root maxLength={4}>
          <OtpField.Slot />
        </OtpField.Root>,
      ),
    ).toThrow('useOtpSlot() must be called inside an <OtpField.Group>');
  });
});
