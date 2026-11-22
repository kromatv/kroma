import { afterEach, describe, expect, it } from 'vitest';
import {
  askForKidsProfile,
  dropKidsProfileAsk,
  kidsProfileAsked,
  takeKidsProfileAsk,
} from './kids-ask';

afterEach(() => {
  dropKidsProfileAsk();
});

describe('a Kids profile asked for from the picker', () => {
  it('is waiting for the admin who asked, and for nobody else', () => {
    askForKidsProfile('admin');

    expect(kidsProfileAsked('admin')).toBe(true);
    expect(kidsProfileAsked('ana')).toBe(false);
  });

  it('opens the form once, then is forgotten', () => {
    askForKidsProfile('admin');

    expect(takeKidsProfileAsk('admin')).toBe(true);
    expect(takeKidsProfileAsk('admin')).toBe(false);
  });

  it('stays waiting when someone else comes in first', () => {
    askForKidsProfile('admin');

    expect(takeKidsProfileAsk('ana')).toBe(false);
    expect(kidsProfileAsked('admin')).toBe(true);
  });

  it('is dropped when the admin walks away from it', () => {
    askForKidsProfile('admin');

    dropKidsProfileAsk();

    expect(kidsProfileAsked('admin')).toBe(false);
  });
});
