// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetails } from '#ui/lib/control';
import { act as call, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { TextArea } from './text-area.component';

afterEach(cleanup);

const entry = () => screen.getByLabelText<HTMLTextAreaElement>('Message');

const type = (text: string) => fireEvent.change(entry(), { target: { value: text } });

const refuse = (_next: string, details: ChangeDetails) => details.cancel();

describe('the value of a text area', () => {
  it('takes what is typed when nobody owns it', () => {
    render(<TextArea label="Message" defaultValue="Bonjour" physicalKeyboard />);

    type('Bonsoir');

    expect(entry().value).toBe('Bonsoir');
  });

  it('asks the owner and waits for the prop when it is controlled', () => {
    const onValueChange = vi.fn();
    render(
      <TextArea label="Message" value="Bonjour" onValueChange={onValueChange} physicalKeyboard />,
    );

    type('Bonsoir');

    expect(onValueChange).toHaveBeenCalledWith(
      'Bonsoir',
      expect.objectContaining({ reason: 'set', source: 'user' }),
    );
    expect(entry().value).toBe('Bonjour');
  });

  it('keeps what it held when the app cancels the change', () => {
    render(
      <TextArea label="Message" defaultValue="Bonjour" onValueChange={refuse} physicalKeyboard />,
    );

    type('Bonsoir');

    expect(entry().value).toBe('Bonjour');
  });
});

describe('a text area under a developer tool', () => {
  it('is read with its value and its setter', () => {
    render(onScreen(<TextArea label="Message" defaultValue="Bonjour" />));

    const read = snapshot().map(({ kind, state, actions }) => ({ kind, state, actions }));

    expect(read).toEqual([
      { kind: 'text-area', state: { value: 'Bonjour' }, actions: ['setValue'] },
    ]);
  });

  it('takes the value a call sets', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(<TextArea label="Message" physicalKeyboard />));

    const report = await call({ steps: [{ ref: 'c1', action: 'setValue', args: ['Bonsoir'] }] });

    expect(report.ok).toBe(true);
    expect(entry().value).toBe('Bonsoir');
  });
});
