// @vitest-environment jsdom

import { declared } from '@kromatv/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionStatus } from './connection-status';

afterEach(cleanup);

const animated = (container: HTMLElement) =>
  [...container.querySelectorAll('*')].filter((el) => declared(el, 'animation-name'));

describe('ConnectionStatus', () => {
  it('says the server is out of reach without anything animating', () => {
    const { container } = render(<ConnectionStatus online={false} label="Reconnexion" />);

    expect(screen.getByLabelText('Reconnexion')).toBeTruthy();
    expect(animated(container)).toEqual([]);
  });

  it('says nothing about reconnecting while the server answers', () => {
    render(<ConnectionStatus online label="Reconnexion" />);

    expect(screen.queryByLabelText('Reconnexion')).toBeNull();
  });
});
