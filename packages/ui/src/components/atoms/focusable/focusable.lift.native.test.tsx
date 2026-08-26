// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { Focusable } from './focusable';

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return {
    ...actual,
    // Absent from react-native-web, which is what the runner resolves.
    useTVEventHandler: undefined,
    Platform: { ...actual.Platform, OS: 'ios', isTV: true },
  };
});

afterEach(cleanup);

const box = (label: string) => screen.getByLabelText(label);
const face = (label: string) => box(label).firstElementChild as HTMLElement;

function row() {
  return render(
    <FocusScope>
      <FocusRegion>
        <Focusable label="Un" autoFocus />
        <Focusable label="Deux" />
      </FocusRegion>
    </FocusScope>,
  );
}

describe('the focus lift on native', () => {
  it('lifts the view the parent orders, not the face inside it', () => {
    row();
    expect(box('Un').style.zIndex).toBe('1');
    expect(face('Un').style.zIndex).not.toBe('1');
  });

  it('leaves the controls beside it where they were', () => {
    row();
    expect(box('Deux').style.zIndex).not.toBe('1');
  });

  it('grounds them on a number rather than on nothing', () => {
    row();
    expect(box('Deux').style.zIndex).toBe('0');
  });
});
