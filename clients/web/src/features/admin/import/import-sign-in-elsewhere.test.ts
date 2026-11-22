import { expect, it } from 'vitest';
import { stageStates } from './import-sign-in-elsewhere.component';

it('starts on the first stage, with the two others still to come', () => {
  expect(stageStates('ready')).toEqual(['now', 'next', 'next']);
});

it('waits on the second stage once the page of the other server is open', () => {
  expect(stageStates('opened')).toEqual(['done', 'now', 'next']);
});
