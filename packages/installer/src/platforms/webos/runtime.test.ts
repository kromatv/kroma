import { describe, expect, it } from 'vitest';
import { webosRuntime } from './runtime';

describe('webosRuntime', () => {
  it('dates an OLED by the year token that follows its series letter', () => {
    expect(webosRuntime(['OLED55C16LA'])).toEqual({
      name: 'webOS',
      version: '6.0',
      engine: { name: 'Chromium', version: '79' },
      learned: 'derived',
    });
  });

  it('dates an LCD set by the two letters that follow its screen size', () => {
    expect(webosRuntime(['55UR78006LK'])).toMatchObject({
      version: '23',
      engine: { version: '94' },
    });
  });

  it('reaches the oldest model year the table dates', () => {
    expect(webosRuntime(['OLED55B8SLC'])).toMatchObject({
      version: '4.0',
      engine: { version: '53' },
    });
  });

  it('reaches the newest model year the table dates', () => {
    expect(webosRuntime(['OLED55C56LA'])).toMatchObject({
      version: '25',
      engine: { version: '120' },
    });
  });

  it('reads past a set that calls its model LG TV to the name that dates it', () => {
    expect(webosRuntime(['LG TV', 'OLED55C16LA'])).toMatchObject({ version: '6.0' });
  });

  it('answers nothing when no name it was handed carries a year', () => {
    expect(webosRuntime(['LG TV', undefined, 'webOS TV'])).toBeNull();
  });
});
