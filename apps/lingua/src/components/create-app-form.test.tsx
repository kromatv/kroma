// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreateAppForm } from './create-app-form.component';

const OWNERS = [
  { login: 'ada', avatarUrl: null, kind: 'user' },
  { login: 'kromatv', avatarUrl: null, kind: 'organization' },
] as const;

afterEach(cleanup);

describe('CreateAppForm', () => {
  it('offers the personal account first, picked, then each organisation and another one', () => {
    render(<CreateAppForm manifest="{}" owners={OWNERS} signIn />);

    const choices = screen.getAllByRole('radio');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      expect.stringContaining('Your account'),
      expect.stringContaining('An organisation you administer'),
      expect.stringContaining('Another organisation'),
    ]);
    expect(choices[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('asks GitHub for the list before there is one', () => {
    render(<CreateAppForm manifest="{}" owners={[]} signIn />);

    expect(
      screen.getByRole('link', { name: 'Choose where to create the GitHub App' }),
    ).toBeDefined();
  });

  it('takes a typed organisation where sign-in is not set up', () => {
    render(<CreateAppForm manifest="{}" owners={[]} signIn={false} />);

    expect(screen.getByRole('textbox', { name: 'Organisation' })).toBeDefined();
  });
});
