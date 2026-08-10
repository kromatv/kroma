import { afterEach, describe, expect, it, vi } from 'vitest';
import { webOsLan } from './lan';

interface Call {
  uri: string;
  payload: string;
}

function withBus(): { calls: Call[]; answer: () => void } {
  const calls: Call[] = [];
  const bridges: { onservicecallback: ((message: string) => void) | null }[] = [];
  class Bridge {
    onservicecallback: ((message: string) => void) | null = null;
    constructor() {
      bridges.push(this);
    }
    call(uri: string, payload: string) {
      calls.push({ uri, payload });
    }
  }
  vi.stubGlobal('PalmServiceBridge', Bridge);
  return {
    calls,
    answer: () => {
      for (const bridge of bridges) bridge.onservicecallback?.('{"returnValue":true}');
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webOsLan', () => {
  it('is undefined where there is no bus to reach', () => {
    expect(webOsLan()).toBeUndefined();
  });

  it('asks the JS Service packaged beside the shell to raise the record', () => {
    const bus = withBus();
    webOsLan()?.publish?.({ name: 'Salon', txt: { proof: 'abc123' } });
    expect(bus.calls).toHaveLength(1);
    expect(bus.calls[0]?.uri).toBe('luna://tv.kroma.webos.service/publish');
    expect(JSON.parse(bus.calls[0]?.payload ?? '')).toEqual({
      name: 'Salon',
      txt: { proof: 'abc123' },
    });
  });

  it('withdraws the record through the stopper it returns', () => {
    const bus = withBus();
    const stop = webOsLan()?.publish?.({ name: 'Salon', txt: {} });
    stop?.();
    expect(bus.calls.map((c) => c.uri)).toEqual([
      'luna://tv.kroma.webos.service/publish',
      'luna://tv.kroma.webos.service/unpublish',
    ]);
    expect(bus.calls[1]?.payload).toBe('{}');
  });

  it('survives the service answering after the call returned', () => {
    const bus = withBus();
    webOsLan()?.publish?.({ name: 'Salon', txt: {} });
    expect(() => bus.answer()).not.toThrow();
  });
});
