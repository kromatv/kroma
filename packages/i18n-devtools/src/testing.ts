import { z } from 'zod';
import type { Engine } from './engine/engine';
import type { Channel } from './server/host';

// The panel reads the locales through React, which polls for them and spins
// forever on an answer that is equal but never the same.
const LOCALES: readonly string[] = ['fr', 'en'];

/** An engine for a test to inspect: the smallest one that answers. */
export function testEngine(over: Partial<Engine> = {}): Engine {
  return {
    name: 'test',
    locales: () => LOCALES,
    activeLocale: () => 'fr',
    inspect: () => {},
    overrideLocale: () => {},
    ...over,
  };
}

const Sent = z.record(z.string(), z.unknown());

interface Asked {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/** A dev server for a test to stand in for: what the page sent it, a way to
 *  answer an ask of `event`, the latest unless `nth` names an earlier one, and
 *  a way to say something nobody asked. */
export function testChannel() {
  const sent: Asked[] = [];
  const heard = new Map<string, (answer: unknown) => void>();
  const channel: Channel = {
    send: (event, data) => sent.push({ event, data: Sent.parse(data) }),
    on: (event, run) => heard.set(event, run),
  };
  const answer = (event: string, data: object, nth = -1) => {
    const asked = sent.filter((ask) => ask.event === event).at(nth);
    heard.get(event)?.({ at: asked?.data.at, ...data });
  };
  const emit = (event: string, data: object = {}) => heard.get(event)?.(data);
  return { channel, sent, answer, emit };
}
