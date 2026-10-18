// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { clearPressGuard } from '#ui/lib/press-guard';
import { layout, measuring } from '#ui/testing';
import { SelectionBar } from './selection-bar';

beforeAll(() => configureRemote());

afterEach(() => {
  clearPressGuard();
  vi.useRealTimers();
});

function Bar({
  count,
  onClear = () => {},
  onUnfollow = () => {},
  items = 2,
}: Readonly<{ count: number; onClear?: () => void; onUnfollow?: () => void; items?: number }>) {
  const more = ['Chercher', 'Rafraîchir', 'Exporter'].slice(0, Math.max(0, items - 2));
  return (
    <SelectionBar.Root count={count} onClear={onClear} label="Sélection">
      <SelectionBar.Status>{`${count} titres sélectionnés`}</SelectionBar.Status>
      <SelectionBar.SelectAll label="Tout sélectionner (40)" onPress={() => {}} />
      <SelectionBar.Clear label="Tout désélectionner" />
      <SelectionBar.Actions label="Autres actions">
        <SelectionBar.Item icon="radar" tone="accent" label="Suivre" onPress={() => {}} />
        {more.map((name) => (
          <SelectionBar.Item key={name} label={name} onPress={() => {}} />
        ))}
        <SelectionBar.Item
          icon="radar-off"
          tone="danger"
          label="Ne plus suivre"
          onPress={onUnfollow}
        />
      </SelectionBar.Actions>
    </SelectionBar.Root>
  );
}

const live = (container: HTMLElement) => container.querySelector('[aria-live="polite"]');

describe('<SelectionBar>', () => {
  it('draws nothing but its live region while nothing is selected', () => {
    const { container } = render(<Bar count={0} />);

    expect(screen.queryByRole('group', { name: 'Sélection' })).toBeNull();
    expect(live(container)?.textContent).toBe('');
  });

  it('shows the count and the actions once a row is selected', () => {
    render(<Bar count={2} />);
    const bar = screen.getByRole('group', { name: 'Sélection' });

    expect(within(bar).getByText('2 titres sélectionnés')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suivre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ne plus suivre' })).toBeTruthy();
  });

  it('announces the status through a polite live region', () => {
    const { container, rerender } = render(<Bar count={2} />);

    rerender(<Bar count={3} />);

    expect(live(container)?.textContent).toBe('3 titres sélectionnés');
  });

  it('leads with the clear control wherever it is written', () => {
    render(<Bar count={2} />);

    const named = screen.getAllByRole('button').map((node) => node.getAttribute('aria-label'));

    expect(named[0]).toBe('Tout désélectionner');
  });

  it('clears the selection from the clear control', () => {
    const onClear = vi.fn();
    render(<Bar count={2} onClear={onClear} />);
    clearPressGuard();

    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('clears the selection on Escape', () => {
    const onClear = vi.fn();
    render(<Bar count={2} onClear={onClear} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('leaves Escape to a field that holds the caret', () => {
    const onClear = vi.fn();
    render(
      <>
        <input aria-label="Chercher" />
        <Bar count={2} onClear={onClear} />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Chercher' });
    field.focus();

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onClear).not.toHaveBeenCalled();
  });

  it('leaves Escape to an open modal dialog', () => {
    const onClear = vi.fn();
    render(
      <>
        <div role="dialog" aria-modal="true" />
        <Bar count={2} onClear={onClear} />
      </>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClear).not.toHaveBeenCalled();
  });

  it('stops listening for Escape once nothing is selected', () => {
    const onClear = vi.fn();
    const { rerender } = render(<Bar count={2} onClear={onClear} />);
    rerender(<Bar count={0} onClear={onClear} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClear).not.toHaveBeenCalled();
  });

  it('keeps the last count on screen while it leaves, then goes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Bar count={2} />);

    rerender(<Bar count={0} />);
    const leaving = screen.queryByText('2 titres sélectionnés');
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(leaving).toBeTruthy();
    expect(screen.queryByText('2 titres sélectionnés')).toBeNull();
  });

  it('hands the focus back to the row it came from when it leaves', () => {
    const { rerender } = render(
      <>
        <button type="button">Arcane</button>
        <Bar count={1} />
      </>,
    );
    const row = screen.getByRole('button', { name: 'Arcane' });
    row.focus();
    screen.getByRole('button', { name: 'Tout désélectionner' }).focus();

    rerender(
      <>
        <button type="button">Arcane</button>
        <Bar count={0} />
      </>,
    );

    expect(document.activeElement).toBe(row);
  });

  it('keeps three items on a wide bar and moves the rest into the menu', () => {
    render(<Bar count={2} items={5} />);

    expect(screen.getByRole('button', { name: 'Suivre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rafraîchir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exporter' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Autres actions' })).toBeTruthy();
  });

  it('keeps one item on a compact bar', () => {
    const { container } = render(<Bar count={2} />);

    layout(measuring(container), { width: 390 });

    expect(screen.getByRole('button', { name: 'Suivre' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ne plus suivre' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Autres actions' })).toBeTruthy();
  });

  it('runs an item from the overflow menu once it has collapsed', () => {
    const onUnfollow = vi.fn();
    const { container } = render(<Bar count={2} onUnfollow={onUnfollow} />);
    layout(measuring(container), { width: 390 });
    clearPressGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }));
    clearPressGuard();

    fireEvent.click(screen.getByText('Ne plus suivre'));

    expect(onUnfollow).toHaveBeenCalledOnce();
  });
});
