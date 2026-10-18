// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { Chip } from './chip';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

const state = (name: string, claim: string) =>
  screen.getByRole('button', { name }).getAttribute(claim);

describe('what a chip claims about itself', () => {
  it('says a filter is on, so the fill is not the only way to know', () => {
    render(<Chip label="Avec des manquants" active onPress={() => {}} />);

    expect(state('Avec des manquants', 'aria-pressed')).toBe('true');
  });

  it('says it is off rather than saying nothing, so the control reads as a toggle', () => {
    render(<Chip label="Avec des manquants" onPress={() => {}} />);

    expect(state('Avec des manquants', 'aria-pressed')).toBe('false');
  });

  it('keeps the vocabulary a call site chose for one option of a set', () => {
    render(<Chip label="Films" active selected onPress={() => {}} />);

    expect(state('Films', 'aria-selected')).toBe('true');
    expect(state('Films', 'aria-pressed')).toBeNull();
  });

  it('lets a call site state the toggle itself, against the fill if it must', () => {
    render(<Chip label="Films" active pressed={false} onPress={() => {}} />);

    expect(state('Films', 'aria-pressed')).toBe('false');
  });
});
