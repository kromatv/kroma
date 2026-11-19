import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWakeHint } from './wake-hint';

const said = async () => ({ mac: 'a0:b1:c2:d3:e4:f5', address: '192.168.1.20' });
const failing = () => Promise.reject(new Error('no such API'));
const never = () => new Promise<unknown>(() => undefined);

afterEach(() => {
  vi.useRealTimers();
});

describe('reading the wake hint a shell hands in', () => {
  it('answers what the platform said', async () => {
    const hint = await readWakeHint(said);

    expect(hint).toEqual({ mac: 'a0:b1:c2:d3:e4:f5', address: '192.168.1.20' });
  });

  it('answers nothing for a shell that has no source', async () => {
    await expect(readWakeHint()).resolves.toBeUndefined();
  });

  it('answers nothing when the platform said nothing usable', async () => {
    await expect(readWakeHint(async () => ({}))).resolves.toBeUndefined();
    await expect(readWakeHint(async () => ({ mac: '' }))).resolves.toBeUndefined();
    await expect(readWakeHint(async () => ({ mac: 42 }))).resolves.toBeUndefined();
  });

  it('answers nothing when the platform call fails', async () => {
    await expect(readWakeHint(failing)).resolves.toBeUndefined();
  });

  it('stops waiting for a platform that never answers', async () => {
    vi.useFakeTimers();
    const reading = readWakeHint(never);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(reading).resolves.toBeUndefined();
  });
});
