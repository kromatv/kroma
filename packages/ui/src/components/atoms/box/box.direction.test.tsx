// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDirection } from '#ui/lib/direction';
import { DirectionRoot } from '#ui/lib/direction-root.component';
import { declared } from '#ui/testing';
import { Box } from './box.component';

afterEach(cleanup);

function Probe() {
  return <span data-testid="probe">{useDirection()}</span>;
}

describe('Box', () => {
  it('pads its start on the left in a language written left to right', () => {
    render(
      <DirectionRoot locale="en">
        <Box ps={6} testID="lead" />
      </DirectionRoot>,
    );

    const lead = screen.getByTestId('lead');
    expect(declared(lead, 'paddingLeft')).toBe('6px');
    expect(declared(lead, 'paddingRight')).toBe('0px');
  });

  it('pads its start on the right in a language written right to left', () => {
    render(
      <DirectionRoot locale="ar">
        <Box ps={6} testID="lead" />
      </DirectionRoot>,
    );

    const lead = screen.getByTestId('lead');
    expect(declared(lead, 'paddingRight')).toBe('6px');
    expect(declared(lead, 'paddingLeft')).toBe('0px');
  });

  it('lets a side beat its axis in a language written right to left', () => {
    render(
      <DirectionRoot locale="ar">
        <Box px={20} ps={4} testID="lead" />
      </DirectionRoot>,
    );

    const lead = screen.getByTestId('lead');
    expect(declared(lead, 'paddingRight')).toBe('4px');
    expect(declared(lead, 'paddingLeft')).toBe('20px');
  });

  it('keeps what it holds left to right in every language when it is told to', () => {
    render(
      <DirectionRoot locale="ar">
        <Box dir="ltr" testID="transport">
          <Box ps={6} testID="lead" />
          <Probe />
        </Box>
      </DirectionRoot>,
    );

    expect(screen.getByTestId('transport').getAttribute('dir')).toBe('ltr');
    expect(declared(screen.getByTestId('lead'), 'paddingLeft')).toBe('6px');
    expect(screen.getByTestId('probe').textContent).toBe('ltr');
  });
});
