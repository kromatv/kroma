import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from './bus';

// The bus is typed against KromaEvents; tests use loose keys via casts.
type LooseBus = {
  emit(key: string, payload: unknown): void;
  on(key: string, handler: (payload: unknown) => void): () => void;
};
const loose = (b: EventBus): LooseBus => b as unknown as LooseBus;

describe('createEventBus', () => {
  it('delivers an emitted payload to every subscriber of that key', () => {
    const bus = loose(createEventBus());
    const a = vi.fn();
    const b = vi.fn();
    bus.on('evt', a);
    bus.on('evt', b);
    bus.emit('evt', { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).toHaveBeenCalledWith({ n: 1 });
  });

  it('does nothing when emitting a key with no subscribers', () => {
    const bus = loose(createEventBus());
    expect(() => bus.emit('none', 1)).not.toThrow();
  });

  it('only notifies subscribers of the matching key', () => {
    const bus = loose(createEventBus());
    const other = vi.fn();
    bus.on('a', other);
    bus.emit('b', 1);
    expect(other).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further delivery', () => {
    const bus = loose(createEventBus());
    const h = vi.fn();
    const off = bus.on('evt', h);
    bus.emit('evt', 1);
    off();
    bus.emit('evt', 2);
    expect(h).toHaveBeenCalledTimes(1);
    expect(h).toHaveBeenCalledWith(1);
  });

  it('uses a snapshot: a handler that unsubscribes another still lets that one fire this round', () => {
    const bus = loose(createEventBus());
    const second = vi.fn();
    let off2: () => void = () => undefined;
    bus.on('evt', () => off2()); // removes the second handler mid-dispatch
    off2 = bus.on('evt', second);
    bus.emit('evt', 1);
    expect(second).toHaveBeenCalledTimes(1);
    bus.emit('evt', 2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a handler subscribed during dispatch does NOT fire in the same round', () => {
    const bus = loose(createEventBus());
    const late = vi.fn();
    bus.on('evt', () => {
      bus.on('evt', late);
    });
    bus.emit('evt', 1);
    expect(late).not.toHaveBeenCalled();
    bus.emit('evt', 2);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
