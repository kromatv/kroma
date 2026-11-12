import { describe, expect, it } from 'vitest';
import { isLanBase, isLanRoute } from './lan-base';

describe('isLanRoute', () => {
  it('is a plain http address in a private range', () => {
    for (const route of [
      'http://192.168.1.2:4040',
      'http://10.0.0.4:80',
      'http://172.31.255.1:4040',
    ]) {
      expect(isLanRoute(route), route).toBe(true);
    }
  });

  it('is nothing public, secure, named, out of range or without a port', () => {
    for (const route of [
      'http://203.0.113.7:4040',
      'http://172.32.0.1:4040',
      'https://192.168.1.2:4443',
      'http://kroma.local:4040',
      'http://192.168.1.2',
      'http://192.168.1.256:4040',
      'http://192.168.1.2:0',
      'http://192.168.1.2:70000',
      'http://192.168.1.2:4040/api',
    ]) {
      expect(isLanRoute(route), route).toBe(false);
    }
  });
});

describe('isLanBase', () => {
  it('is a base already on the network or on this machine', () => {
    for (const base of [
      'http://192.168.1.2:4040',
      'http://kroma.local:4040',
      'http://localhost:3000',
      'http://127.0.0.1:4040',
      'https://10.0.0.4:4443',
    ]) {
      expect(isLanBase(base), base).toBe(true);
    }
  });

  it('is not a base on the internet', () => {
    for (const base of [
      'https://kroma.example',
      'https://203.0.113.7',
      'https://local.example.com',
    ]) {
      expect(isLanBase(base), base).toBe(false);
    }
  });
});
