// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { If } from './if';

describe('If', () => {
  it('renders children when the condition is truthy', () => {
    render(
      <If condition={1}>
        <span>on</span>
      </If>,
    );
    expect(screen.getByText('on')).toBeTruthy();
  });

  it('renders the fallback when the condition is falsy', () => {
    render(
      <If condition={0} fallback={<span>off</span>}>
        <span>on</span>
      </If>,
    );
    expect(screen.queryByText('on')).toBeNull();
    expect(screen.getByText('off')).toBeTruthy();
  });

  it('renders nothing when falsy with no fallback', () => {
    const { container } = render(
      <If condition={false}>
        <span>on</span>
      </If>,
    );
    expect(container.textContent).toBe('');
  });

  it('does not render the untaken branch', () => {
    const Skipped = vi.fn(() => <span>off</span>);
    render(
      <If condition fallback={<Skipped />}>
        <span>on</span>
      </If>,
    );
    expect(Skipped).not.toHaveBeenCalled();
    expect(screen.getByText('on')).toBeTruthy();
  });
});
