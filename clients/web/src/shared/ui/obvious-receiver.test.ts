import { DeviceId } from '@kromatv/client';
import type { CastReceiver } from '@kromatv/client/cast';
import { describe, expect, it } from 'vitest';
import { obviousReceiver } from './obvious-receiver';

const tv = (id: string, name: string): CastReceiver => ({
  id: DeviceId.parse(id),
  name,
  platform: 'Tizen',
  username: 'alice',
  network: 'LAN',
  controllers: [],
  asleep: false,
});

const salon = tv('tv-salon-01', 'Salon');
const chambre = tv('tv-chambre-02', 'Chambre');

describe('which television a press on "Play on TV" uses with nothing asked', () => {
  it('is the one already being driven, however many there are', () => {
    expect(obviousReceiver([salon, chambre], chambre)).toBe(chambre);
  });

  it('is the only one there is', () => {
    expect(obviousReceiver([salon], null)).toBe(salon);
  });

  it('is nobody when there is a choice to make', () => {
    expect(obviousReceiver([salon, chambre], null)).toBeNull();
    expect(obviousReceiver([], null)).toBeNull();
  });
});
