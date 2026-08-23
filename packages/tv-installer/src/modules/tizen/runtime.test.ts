import { describe, expect, it } from 'vitest';
import { tizenRuntime } from './runtime';

describe('tizenRuntime', () => {
  it('dates a Samsung by the model year its internal model name starts with', () => {
    expect(tizenRuntime('24_PTM_FTV_T09')).toEqual({
      name: 'Tizen',
      version: '8.0',
      engine: { name: 'Chromium', version: '108' },
      learned: 'derived',
    });
  });

  it('reaches the oldest model year the table dates', () => {
    expect(tizenRuntime('17_KANTM_UHD')).toMatchObject({
      version: '3.0',
      engine: { version: '47' },
    });
  });

  it('reaches the newest model year the table dates', () => {
    expect(tizenRuntime('25_MT8532_AISPK')).toMatchObject({
      version: '9.0',
      engine: { version: '120' },
    });
  });

  it('answers nothing for a year no Tizen release is known for', () => {
    expect(tizenRuntime('99_PTM_FTV_T09')).toBeNull();
  });

  it('answers nothing for a model name that opens with no year', () => {
    expect(tizenRuntime('GQ75LS03DAUXZG')).toBeNull();
  });

  it('answers nothing for a set that reported no model at all', () => {
    expect(tizenRuntime(undefined)).toBeNull();
  });
});
