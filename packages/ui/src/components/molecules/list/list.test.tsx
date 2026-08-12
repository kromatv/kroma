// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { List } from './list';

afterEach(cleanup);

describe('<List>', () => {
  it('names the list and draws the roles a reader navigates it by', () => {
    render(
      <List.Root label="Steps">
        <List.Item>Install the module.</List.Item>
        <List.Item>Give it a port.</List.Item>
      </List.Root>,
    );
    expect(screen.getByRole('list', { name: 'Steps' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('numbers an ordered list in the order the items were written', () => {
    render(
      <List.Root ordered>
        <List.Item>First</List.Item>
        <List.Item>Second</List.Item>
        <List.Item>Third</List.Item>
      </List.Root>,
    );
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('3.')).toBeTruthy();
  });

  it('writes no number at all in a bulleted list', () => {
    render(
      <List.Root>
        <List.Item>Only</List.Item>
      </List.Root>,
    );
    expect(screen.queryByText('1.')).toBeNull();
  });

  it('draws a task box for an item that carries one, ticked or not', () => {
    render(
      <List.Root>
        <List.Item checked>Done</List.Item>
        <List.Item checked={false}>Not done</List.Item>
        <List.Item>Not a task</List.Item>
      </List.Root>,
    );
    // The box is a drawing and never a control: a document is not a form.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('takes a block for an item that is more than a sentence', () => {
    render(
      <List.Root>
        <List.Item>
          <Text>A paragraph of its own</Text>
        </List.Item>
      </List.Root>,
    );
    expect(screen.getByText('A paragraph of its own')).toBeTruthy();
  });

  it('counts only a direct item, so a number is never a guess', () => {
    render(
      <List.Root ordered>
        {'  '}
        <List.Item>First</List.Item>
      </List.Root>,
    );
    expect(screen.getByText('1.')).toBeTruthy();
  });

  it('refuses an item written outside its Root', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<List.Item>Orphan</List.Item>)).toThrow(/List.Root/);
    quiet.mockRestore();
  });
});
