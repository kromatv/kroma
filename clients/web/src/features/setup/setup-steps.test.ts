import { expect, it } from 'vitest';
import {
  answeredSteps,
  canSkip,
  isSetupStep,
  laterStep,
  readSetupStart,
  readSetupStep,
  stepAfter,
  stepBefore,
  stepOpenTo,
  stepsBehind,
  stepsFor,
  stepsUpTo,
} from './setup-steps';

it('asks the language first, then how to start, then for the owner account', () => {
  expect(stepAfter('language')).toBe('start');
  expect(stepAfter('start')).toBe('owner');
  expect(stepAfter('owner')).toBe('media');
});

it('stays on the last screen when there is none after it', () => {
  expect(stepAfter('done')).toBe('done');
});

it('leads back one step at a time, down to the first', () => {
  expect(stepBefore('media')).toBe('owner');
  expect(stepBefore('modules')).toBe('media');
  expect(stepBefore('owner')).toBe('start');
  expect(stepBefore('language')).toBeNull();
});

it('lets a person skip every step after the owner account, and none before', () => {
  expect(canSkip('language')).toBe(false);
  expect(canSkip('owner')).toBe(false);
  expect(canSkip('media')).toBe(true);
  expect(canSkip('privacy')).toBe(true);
  expect(canSkip('done')).toBe(false);
});

it('counts every screen as a step but the last one', () => {
  expect(answeredSteps()).toHaveLength(8);
  expect(answeredSteps()).not.toContain('done');
});

it('knows which steps are behind the one on screen', () => {
  expect(stepsBehind('language')).toEqual([]);
  expect(stepsBehind('media')).toEqual(['language', 'start', 'owner']);
});

it('reads a step from an address and refuses anything else', () => {
  expect(isSetupStep('media')).toBe(true);
  expect(isSetupStep('admin')).toBe(false);
  expect(isSetupStep(undefined)).toBe(false);
});

it('opens nothing after the owner account to someone who is not the owner yet', () => {
  expect(stepOpenTo('media', 'stranger')).toBe('language');
  expect(stepOpenTo('owner', 'stranger')).toBe('owner');
});

it('lets the owner open any step, the earlier ones included, to change an answer', () => {
  expect(stepOpenTo('language', 'owner')).toBe('language');
  expect(stepOpenTo('owner', 'owner')).toBe('owner');
  expect(stepOpenTo('done', 'owner')).toBe('done');
});

it('starts at the language, fresh, when the address names nothing it knows', () => {
  expect(readSetupStep('nowhere')).toBe('language');
  expect(readSetupStep('media')).toBe('media');
  expect(readSetupStart(undefined)).toBe('fresh');
  expect(readSetupStart('bring')).toBe('bring');
});

it('remembers the furthest step a person reached when they go back', () => {
  expect(laterStep('modules', 'language')).toBe('modules');
  expect(laterStep('language', 'modules')).toBe('modules');
  expect(laterStep('media', 'media')).toBe('media');
});

it('keeps every step up to the furthest one open, that one included', () => {
  expect(stepsUpTo('language')).toEqual(['language']);
  expect(stepsUpTo('media')).toEqual(['language', 'start', 'owner', 'media']);
});

it('leads an owner who brings a server over through the import, after their account', () => {
  expect(stepAfter('owner', 'bring')).toBe('import');
  expect(stepAfter('import', 'bring')).toBe('media');
  expect(stepBefore('media', 'bring')).toBe('import');
});

it('has no import step for an owner who starts fresh', () => {
  expect(stepsFor('fresh')).not.toContain('import');
  expect(stepAfter('owner', 'fresh')).toBe('media');
  expect(stepOpenTo('import', 'owner', 'fresh')).toBe('media');
  expect(stepOpenTo('import', 'owner', 'bring')).toBe('import');
});

it('counts the import among the steps of an owner who brings a server over', () => {
  expect(answeredSteps('bring')).toHaveLength(9);
  expect(stepsBehind('media', 'bring')).toEqual(['language', 'start', 'owner', 'import']);
  expect(stepsUpTo('import', 'bring')).toEqual(['language', 'start', 'owner', 'import']);
});
