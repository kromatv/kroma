// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '#ui/components/atoms/badge';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { SegmentGroup } from './segment-group';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

function Group({
  value,
  onValueChange,
  disabled,
}: Readonly<{ value: string; onValueChange: (v: string) => void; disabled?: string }>) {
  return (
    <SegmentGroup.Root value={value} onValueChange={onValueChange} label="Mode">
      <SegmentGroup.Item value="a">
        <SegmentGroup.Label>A</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="b" disabled={disabled === 'b'}>
        <SegmentGroup.Label>B</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="c">
        <SegmentGroup.Label>C</SegmentGroup.Label>
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  );
}

describe('SegmentGroup', () => {
  it('is a radiogroup whose segments carry the selection', () => {
    render(<Group value="a" onValueChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('false');
  });

  it('steps over a disabled segment rather than selecting it', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} disabled="b" />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowRight' });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('selects the next segment when nothing is disabled', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowRight' });

    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('wraps around the row backwards', () => {
    const onValueChange = vi.fn();
    render(<Group value="a" onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode' }), { key: 'ArrowLeft' });

    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('names the part that was rendered outside its Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<SegmentGroup.Item value="a" />)).toThrow(
      '<SegmentGroup.Item> must be used inside <SegmentGroup.Root>',
    );

    vi.restoreAllMocks();
  });

  it('names the face that was rendered outside its Item', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<SegmentGroup.Label>A</SegmentGroup.Label>)).toThrow(
      '<SegmentGroup.Label> must be used inside <SegmentGroup.Item>',
    );

    vi.restoreAllMocks();
  });
});

describe('how a segment is named', () => {
  it('reads the name off the Label part, not the Hint', () => {
    render(
      <SegmentGroup.Root value="auto" onValueChange={() => {}} label="Playback mode">
        <SegmentGroup.Item value="auto">
          <SegmentGroup.Label>Auto</SegmentGroup.Label>
          <SegmentGroup.Hint>Recommended</SegmentGroup.Hint>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="direct">
          <SegmentGroup.Label>Direct play</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>,
    );
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeTruthy();
    expect(screen.getByText('Recommended')).toBeTruthy();
  });

  it('lets a glyph-only segment carry its name as a prop', () => {
    render(
      <SegmentGroup.Root value="light" onValueChange={() => {}} label="Theme">
        <SegmentGroup.Item value="light" icon="sun" label="Light" />
        <SegmentGroup.Item value="dark" icon="moon" label="Dark" />
      </SegmentGroup.Root>,
    );
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(screen.queryByText('Light')).toBeNull();
  });
});

describe('a segment that holds more than a string', () => {
  it('draws the children and still answers to the label', () => {
    render(
      <SegmentGroup.Root value="unread" onValueChange={() => {}} label="Filter">
        <SegmentGroup.Item value="all">
          <SegmentGroup.Label>All</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="unread" label="Unread, 2">
          <Text>Unread</Text>
          <Badge tone="neutral">2</Badge>
        </SegmentGroup.Item>
      </SegmentGroup.Root>,
    );
    // What is drawn is the composition; what is heard is the label.
    expect(screen.getByText('Unread')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByLabelText('Unread, 2')).toBeTruthy();
  });
});
