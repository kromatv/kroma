import { randomInt } from 'node:crypto';
import type { Television } from './television';

const octet = () => randomInt(1, 255);
const pick = <T>(values: readonly T[]): T => values[randomInt(values.length)] as T;

const NAMES = ['Salon', 'Chambre', 'Cuisine', 'Bureau', 'Atelier'];
const MODELS = ['QE55Q60A', 'GQ75LS03DA', 'UE50AU7172', 'OLED55C1', '55PUS7304'];

/**
 * A television nothing in particular. Every field a test does not name is
 * generated, so a test that depends on one has to say which and cannot pass by
 * accident on a value that happened to be there.
 */
export function television(over: Partial<Television> = {}): Television {
  return {
    host: [10, octet(), octet(), octet()].join('.'),
    platform: 'tizen',
    vendor: 'Samsung',
    name: `${pick(NAMES)} ${octet()}`,
    model: pick(MODELS),
    developerMode: 'on',
    sideloadable: true,
    note: '',
    runtime: { name: 'Tizen', version: '8.0', engine: null, learned: 'reported' },
    ...over,
  };
}
