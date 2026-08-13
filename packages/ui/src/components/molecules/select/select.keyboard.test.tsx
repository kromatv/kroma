// @vitest-environment jsdom

// The browser app mounts no spatial navigator, so a kit control is reached the
// way every other control on a web page is reached: with Tab, and operated
// with Enter or Space. react-native-web only gives a tabindex to the roles it
// recognises as interactive, which silently left `combobox`, `menuitem` and
// `option` out of the tab order entirely.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { clearPressGuard } from '#ui/lib/press-guard';
import { layout } from '#ui/testing';
import { Select, type SelectRootProps } from './select';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

// A row's ring is painted rather than focused, so it arrives as a class and is
// only there to compute.
function ringed(row: HTMLElement) {
  return getComputedStyle(row).outlineWidth === `${activeTheme().ring.focusEdge.outlineWidth}px`;
}

// react-native-web's press responder fires on the keyUP that follows a
// keyDown, so a keyboard press is both halves.
function press(el: HTMLElement, key = 'Enter') {
  el.focus();
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
}

function Source({
  value = 'all',
  onValueChange,
  disabled,
  block,
}: Readonly<{
  value?: string;
  onValueChange?: (next: string) => void;
  disabled?: boolean;
  block?: boolean;
}>) {
  return (
    <Select.Root label="Source" value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger block={block} />
      <Select.Item value="all">Toutes les sources</Select.Item>
      <Select.Item value="server">kroma_server</Select.Item>
    </Select.Root>
  );
}

describe('a kit control on a web page', () => {
  it('puts the select trigger in the tab order', () => {
    render(<Source />);
    expect(screen.getByRole('combobox').getAttribute('tabindex')).toBe('0');
  });

  it('opens the select from the keyboard', () => {
    render(<Source />);
    const trigger = screen.getByRole('combobox');
    press(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('opens it with Space too, the key the responder skips for a combobox', () => {
    render(<Source />);
    const trigger = screen.getByRole('combobox');
    press(trigger, ' ');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('keeps the focus on the trigger and names the list from it', () => {
    render(<Source />);
    const trigger = screen.getByRole('combobox');
    press(trigger);

    // The combobox pattern proper: the trigger keeps the focus and points at
    // the list and at the active row, so the panel can be portalled out
    // without fighting a <Modal>'s focus trap for it.
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox');
    expect(trigger.getAttribute('aria-controls')).toBe(list.getAttribute('id'));
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    const active = trigger.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active as string)).toBeTruthy();

    // The pointer names the row it hovers, and the trigger has to follow it:
    // a stale activedescendant is a screen reader reading the wrong option.
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).not.toBe(active);
  });

  it('portals the panel out of the trigger, so nothing later can paint over it', () => {
    render(
      <div data-testid="row" style={{ position: 'relative', zIndex: 0 }}>
        <Source />
      </div>,
    );
    const trigger = screen.getByRole('combobox');
    press(trigger);
    // `position: fixed` escapes overflow but not stacking: the panel has to
    // leave the row's stacking context altogether.
    expect(screen.getByTestId('row').contains(screen.getByRole('listbox'))).toBe(false);
  });

  it('pins the panel to the trigger box, never narrower', () => {
    render(<Source block />);
    const trigger = screen.getByRole('combobox');
    trigger.getBoundingClientRect = () =>
      ({ left: 70, right: 508, top: 100, bottom: 140, width: 438, height: 40 }) as DOMRect;
    press(trigger);
    const panel = screen.getByRole('listbox');
    expect(panel.style.left).toBe('70px');
    expect(panel.style.minWidth).toBe('438px');
  });

  it('sizes the panel to its content, with the trigger as the floor', () => {
    render(<Source />);
    const trigger = screen.getByRole('combobox');
    press(trigger);
    const panel = screen.getByRole('listbox');
    // A row is the trigger's own label plus a tick and its padding, so a panel
    // held to the trigger's width truncates what the trigger shows in full.
    expect(panel.style.width).toBe('');
    expect(panel.style.minWidth).not.toBe('');
    expect(Number.parseInt(panel.style.maxWidth, 10)).toBeGreaterThan(0);
  });

  it('walks the options and picks one, all from the trigger', () => {
    const onValueChange = vi.fn();
    render(<Source onValueChange={onValueChange} />);
    const trigger = screen.getByRole('combobox');
    press(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    press(trigger);
    expect(onValueChange).toHaveBeenCalledWith('server', {
      item: expect.objectContaining({ value: 'server', label: 'kroma_server' }),
    });
  });

  it('does not reopen on the keyup of the press that picked', () => {
    // The panel answers Enter on keyDown; the responder underneath would
    // answer the keyUp as a press of the trigger and open the panel straight
    // back up, so a key the panel takes must not reach it at all.
    const onValueChange = vi.fn();
    render(<Source onValueChange={onValueChange} />);
    const trigger = screen.getByRole('combobox');
    press(trigger);
    press(trigger);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps a disabled control out of the tab order', () => {
    render(<Source disabled />);
    expect(screen.getByRole('combobox').getAttribute('tabindex')).not.toBe('0');
  });

  // The roles react-native-web renders as a plain <div>, and so leaves out of
  // the tab order. Enter is the library's own doing - its press responder
  // answers it on anything it wraps - so the kit must NOT answer it as well:
  // two presses per Enter is open-then-shut on a <Select>. Space is the key
  // the responder reserves for `role="button"`, and the kit fills it in.
  const PLAIN = ['menuitem', 'option', 'combobox'] as const;

  it.each(PLAIN)('puts a %s in the tab order', (role) => {
    render(<Focusable label="Ouvrir" role={role} onPress={() => {}} />);
    expect(screen.getByLabelText('Ouvrir').getAttribute('tabindex')).toBe('0');
  });

  it.each(PLAIN)('fires a %s once per Enter, not twice', (role) => {
    const onPress = vi.fn();
    render(<Focusable label="Ouvrir" role={role} onPress={onPress} />);
    const el = screen.getByLabelText('Ouvrir');
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyUp(el, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(PLAIN)('fires a %s once per Space, not twice', (role) => {
    const onPress = vi.fn();
    render(<Focusable label="Ouvrir" role={role} onPress={onPress} />);
    const el = screen.getByLabelText('Ouvrir');
    fireEvent.keyDown(el, { key: ' ' });
    fireEvent.keyUp(el, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // `role="button"` is the one that needs nothing from the kit: it renders a
  // real <button>, which the browser itself activates from the keyboard.
  // (jsdom does not synthesise that click, so the press cannot be asserted
  // here - only the element it lands on.)
  it('leaves a button to the browser', () => {
    render(<Focusable label="Ouvrir" role="button" onPress={() => {}} />);
    expect(screen.getByLabelText('Ouvrir').tagName).toBe('BUTTON');
  });
});

describe('the parts', () => {
  it('reports every way out with its reason', () => {
    const onOpenChange = vi.fn();
    render(
      <Select.Root label="Source" defaultValue="all" onOpenChange={onOpenChange}>
        <Select.Trigger />
        <Select.Item value="all">Toutes les sources</Select.Item>
        <Select.Item value="server">kroma_server</Select.Item>
      </Select.Root>,
    );
    const trigger = screen.getByRole('combobox');
    press(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true, { reason: 'trigger' });

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'escape' });

    press(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'select' });

    press(trigger);
    fireEvent.click(screen.getByLabelText('Fermer'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'outside' });
  });

  it('runs itself when only a default is given', () => {
    render(
      <Select.Root label="Source" defaultValue="all">
        <Select.Trigger />
        <Select.Item value="all">Toutes les sources</Select.Item>
        <Select.Item value="server">kroma_server</Select.Item>
      </Select.Root>,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('aria-label')).toBe('Source: Toutes les sources');
    press(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger.getAttribute('aria-label')).toBe('Source: kroma_server');
  });

  it('reads the placeholder until something is picked', () => {
    render(
      <Select.Root placeholder="Qualité">
        <Select.Trigger />
        <Select.Item value="1080p">1080p</Select.Item>
      </Select.Root>,
    );
    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('Qualité');
    expect(screen.getByText('Qualité')).toBeTruthy();
  });

  it('opens in a dialog under a D-pad, and Back says so', () => {
    const onOpenChange = vi.fn();
    render(
      <FocusScope>
        <Select.Root label="Source" defaultValue="all" defaultOpen onOpenChange={onOpenChange}>
          <Select.Trigger />
          <Select.Item value="all">Toutes les sources</Select.Item>
          <Select.Item value="server">kroma_server</Select.Item>
        </Select.Root>
      </FocusScope>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'back' });
  });

  it('picks the row the remote pressed in the dialog', () => {
    const onValueChange = vi.fn();
    render(
      <FocusScope>
        <Select.Root label="Source" defaultValue="all" defaultOpen onValueChange={onValueChange}>
          <Select.Trigger />
          <Select.Item value="all">Toutes les sources</Select.Item>
          <Select.Item value="server">kroma_server</Select.Item>
        </Select.Root>
      </FocusScope>,
    );
    clearPressGuard();
    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith('server', {
      item: expect.objectContaining({ value: 'server' }),
    });
  });

  it('takes a number written as the row for its label', () => {
    render(
      <Select.Root label="Débit" defaultValue="8">
        <Select.Trigger />
        <Select.Item value="8">{8}</Select.Item>
        <Select.Item value="12">{12}</Select.Item>
      </Select.Root>,
    );
    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('Débit: 8');
  });

  it('names a composed row from its label, and still draws the row as written', () => {
    render(
      <Select.Root label="Source" defaultValue="server">
        <Select.Trigger />
        <Select.Item value="all" label="Toutes les sources">
          <Text>Toutes</Text>
        </Select.Item>
        <Select.Item value="server" label="kroma_server">
          <Text>kroma</Text>
        </Select.Item>
      </Select.Root>,
    );
    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('Source: kroma_server');

    press(screen.getByRole('combobox'));
    expect(screen.getByText('kroma')).toBeTruthy();
    // The row draws one thing and is named another, so the listbox announces
    // the option rather than whatever the caller's markup happened to expose.
    expect(screen.getByRole('option', { name: 'kroma_server' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('draws the tick on the picked row through <Select.Indicator>', () => {
    render(
      <Select.Root label="Source" defaultValue="server">
        <Select.Trigger />
        <Select.Item value="all">Toutes les sources</Select.Item>
        <Select.Item value="server">kroma_server</Select.Item>
      </Select.Root>,
    );
    press(screen.getByRole('combobox'));
    const rows = screen.getAllByRole('option');
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });
});

const RATES = ['1080p', '720p', '480p', '360p', '240p'];
const ROW_HEIGHT = 44;
const FOLD = ROW_HEIGHT * 2;

function Quality({ onValueChange }: Readonly<Pick<SelectRootProps, 'onValueChange'>>) {
  return (
    <Select.Root label="Qualité" defaultValue="1080p" onValueChange={onValueChange}>
      <Select.Trigger />
      {RATES.map((rate) => (
        <Select.Item key={rate} value={rate}>
          {rate}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

describe('the anchored listbox', () => {
  it('picks the row that was clicked', () => {
    const onValueChange = vi.fn();
    render(<Quality onValueChange={onValueChange} />);
    press(screen.getByRole('combobox'));

    fireEvent.click(screen.getAllByRole('option')[2] as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith('480p', {
      item: expect.objectContaining({ value: '480p' }),
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens on the first row that can be picked when nothing is', () => {
    render(
      <Select.Root placeholder="Qualité">
        <Select.Trigger />
        <Select.Item value="original" disabled>
          Original
        </Select.Item>
        <Select.Item value="1080p">1080p</Select.Item>
      </Select.Root>,
    );
    const trigger = screen.getByRole('combobox');
    press(trigger);
    const rows = screen.getAllByRole('option');
    expect(trigger.getAttribute('aria-activedescendant')).toBe(rows[1]?.getAttribute('id'));
  });

  it('rings the row the keys are on, and leaves the pointer its wash', () => {
    render(<Quality />);
    const trigger = screen.getByRole('combobox');
    press(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const rows = screen.getAllByRole('option');
    expect(ringed(rows[1] as HTMLElement)).toBe(true);
    expect(ringed(rows[0] as HTMLElement)).toBe(false);

    fireEvent.mouseMove(document);
    fireEvent.pointerEnter(rows[3] as HTMLElement);
    expect(rows[3]?.getAttribute('id')).toBe(trigger.getAttribute('aria-activedescendant'));
    expect(ringed(rows[3] as HTMLElement)).toBe(false);
  });

  it('types ahead to the row the key names', () => {
    render(<Quality />);
    const trigger = screen.getByRole('combobox');
    press(trigger);

    fireEvent.keyDown(trigger, { key: '4' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger.getAttribute('aria-label')).toBe('Qualité: 480p');
  });

  it('hands the active row to whichever one the pointer is over', () => {
    render(<Quality />);
    const trigger = screen.getByRole('combobox');
    press(trigger);

    const rows = screen.getAllByRole('option');
    fireEvent.pointerEnter(rows[3] as HTMLElement);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(rows[3]?.getAttribute('id'));

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger.getAttribute('aria-label')).toBe('Qualité: 360p');
  });

  it('keeps the active row in sight as the keyboard walks past the fold', () => {
    render(<Quality />);
    const trigger = screen.getByRole('combobox');
    press(trigger);

    const scroller = screen.getByRole('listbox').firstElementChild as HTMLElement;
    let scrollTop = 0;
    // jsdom lays nothing out and scrolls nothing, so the panel is told the two
    // measurements it reads back off the scroller.
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next;
      },
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: FOLD });
    const rows = screen.getAllByRole('option');
    for (const [index, row] of rows.entries()) {
      layout(row, { y: index * ROW_HEIGHT, height: ROW_HEIGHT });
    }

    const last = ROW_HEIGHT * (rows.length - 1);
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(scrollTop).toBeLessThanOrEqual(last);
    expect(scrollTop + FOLD).toBeGreaterThanOrEqual(last + ROW_HEIGHT);

    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(scrollTop).toBe(0);
  });
});
