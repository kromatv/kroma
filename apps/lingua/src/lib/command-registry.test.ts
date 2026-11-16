import { describe, expect, it, vi } from 'vitest';
import { commandRegistry, type LinguaCommand } from './command-registry';

const command = (id: string): LinguaCommand => ({ id, label: id, group: 'Go to', run: () => {} });

describe('commandRegistry', () => {
  it('lists every page’s rows, in the order the pages first lent them', () => {
    const registry = commandRegistry();

    registry.lend('page', [command('a'), command('b')]);
    registry.lend('header', [command('c')]);
    registry.lend('page', [command('d')]);

    expect(registry.rows().map((c) => c.id)).toEqual(['d', 'c']);
  });

  it('drops a page’s rows when it takes them back, and tells whoever listens', () => {
    const registry = commandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.lend('page', [command('a')]);
    registry.takeBack('page');
    registry.takeBack('page');

    expect(registry.rows()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops telling a listener that unsubscribed', () => {
    const registry = commandRegistry();
    const listener = vi.fn();
    const stop = registry.subscribe(listener);

    stop();
    registry.lend('page', [command('a')]);

    expect(listener).not.toHaveBeenCalled();
  });

  it('hands back the same list until something changes', () => {
    const registry = commandRegistry();
    registry.lend('page', [command('a')]);

    expect(registry.rows()).toBe(registry.rows());
  });
});
