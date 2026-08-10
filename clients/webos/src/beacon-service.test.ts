import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PublishOptions {
  instance: string;
  txt?: Record<string, string>;
}

const { registered, raised, serviceIds, stop } = vi.hoisted(() => ({
  registered: new Map<string, (message: LunaMessage) => void>(),
  raised: [] as PublishOptions[],
  serviceIds: [] as string[],
  stop: { calls: 0 },
}));

interface LunaMessage {
  payload: Record<string, unknown>;
  respond: (response: Record<string, unknown>) => void;
}

vi.mock('webos-service', () => ({
  default: class {
    constructor(id: string) {
      serviceIds.push(id);
    }
    register(method: string, handler: (message: LunaMessage) => void) {
      registered.set(method, handler);
    }
  },
}));

vi.mock('@kroma/mdns-beacon', () => ({
  publish: (options: PublishOptions) => {
    raised.push(options);
    return {
      stop: () => {
        stop.calls += 1;
      },
    };
  },
}));

await import('./beacon-service');

function send(method: string, payload: Record<string, unknown>): Record<string, unknown> {
  let answer: Record<string, unknown> = {};
  registered.get(method)?.({ payload, respond: (response) => (answer = response) });
  return answer;
}

beforeEach(() => {
  send('unpublish', {});
  raised.length = 0;
  stop.calls = 0;
});

describe('the webOS beacon service', () => {
  it('registers itself under the id the shell calls over Luna', () => {
    expect(serviceIds).toEqual(['tv.kroma.webos.service']);
    expect([...registered.keys()]).toEqual(['publish', 'unpublish']);
  });

  it('raises the beacon with the name the owner gave the television', () => {
    expect(send('publish', { name: 'Salon', txt: { proof: 'abc123' } })).toEqual({
      returnValue: true,
    });
    expect(raised).toEqual([{ instance: 'Salon', txt: { proof: 'abc123' } }]);
  });

  it('refuses to publish an unnamed television rather than announcing a blank one', () => {
    for (const payload of [{}, { name: '' }, { name: 42 }]) {
      expect(send('publish', payload)).toEqual({ returnValue: false, errorText: 'name required' });
    }
    expect(raised).toEqual([]);
  });

  it('replaces the running beacon on a second publish', () => {
    send('publish', { name: 'Salon' });
    send('publish', { name: 'Chambre' });
    expect(stop.calls).toBe(1);
    expect(raised.map((r) => r.instance)).toEqual(['Salon', 'Chambre']);
  });

  it('keeps only the text entries a TXT record can actually carry', () => {
    send('publish', { name: 'Salon', txt: { proof: 'abc', port: 8080, blank: '', gone: null } });
    expect(raised[0]?.txt).toEqual({ proof: 'abc' });
  });

  it('ignores a txt payload that is not an object', () => {
    send('publish', { name: 'Salon', txt: 'proof=abc' });
    expect(raised[0]?.txt).toEqual({});
  });

  it('withdraws the beacon on unpublish, and answers even when there is none', () => {
    send('publish', { name: 'Salon' });
    expect(send('unpublish', {})).toEqual({ returnValue: true });
    expect(stop.calls).toBe(1);
    expect(send('unpublish', {})).toEqual({ returnValue: true });
    expect(stop.calls).toBe(1);
  });
});
