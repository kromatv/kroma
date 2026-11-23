// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OverlayHost } from '#ui/lib/overlay-host.component';
import { onScreen, wearsRing } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { Select } from './select.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Source({ value }: Readonly<{ value: string }>) {
  return (
    <OverlayHost>
      <Select.Root label="Source" defaultValue={value} defaultOpen presentation="dialog">
        <Select.Trigger />
        <Select.Item value="all">Toutes les sources</Select.Item>
        <Select.Item value="server">kroma_server</Select.Item>
      </Select.Root>
    </OverlayHost>
  );
}

const option = (name: string) => screen.getByRole('option', { name });

describe('a <Select> on a screen that mounts an <OverlayHost>', () => {
  it('lists its options in the host layer, where a television draws its dialogs', () => {
    render(<Source value="all" />);
    clearPressGuard();

    fireEvent.click(option('kroma_server'));

    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('Source: kroma_server');
  });

  it('opens with the remote on the picked option', () => {
    render(onScreen(<Source value="server" />, { remote: true }));

    expect(wearsRing(option('kroma_server'))).toBe(true);
    expect(wearsRing(option('Toutes les sources'))).toBe(false);
  });
});
