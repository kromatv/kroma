// @vitest-environment jsdom

import { fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropzone } from './dropzone.web';

const file = (name: string, size: number, type = '') => {
  const made = new File(['x'], name, { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

const picker = (container: HTMLElement) => container.querySelector('input') as HTMLInputElement;

describe('the surface', () => {
  it('hands over what was dropped on it', () => {
    const onDrop = vi.fn();
    render(
      <Dropzone.Root label="Upload" accept=".torrent" onDrop={onDrop}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { files: [file('a.torrent', 10)] },
    });

    expect(onDrop).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.torrent' })]);
  });

  it('reports what it turned away rather than swallowing it', () => {
    const onDrop = vi.fn();
    const onReject = vi.fn();
    render(
      <Dropzone.Root label="Upload" maxSize={100} onDrop={onDrop} onReject={onReject}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { files: [file('big.torrent', 900)] },
    });

    expect(onDrop).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith([expect.objectContaining({ reason: 'size' })]);
  });

  it('takes nothing while it is busy', () => {
    const onDrop = vi.fn();
    render(
      <Dropzone.Root label="Upload" loading onDrop={onDrop}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.drop(screen.getByRole('button'), {
      dataTransfer: { files: [file('a.torrent', 10)] },
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it('highlights while a file is over it, and stops when it leaves', () => {
    render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );
    const zone = screen.getByRole('button');

    fireEvent.dragOver(zone);
    expect(zone.getAttribute('data-drag-active')).not.toBeNull();

    fireEvent.dragLeave(zone);
    expect(zone.getAttribute('data-drag-active')).toBeNull();
  });

  it('is a real button, so picking a file never needs a pointer', () => {
    render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    expect(screen.getByRole('button').tagName).toBe('BUTTON');
  });

  it('keeps the picker out of the accessibility tree, so the surface is the only control', () => {
    const { container } = render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    expect(isInaccessible(picker(container))).toBe(true);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Upload');
  });

  it('opens the picker when the surface is clicked', () => {
    const { container } = render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    const click = vi.spyOn(picker(container), 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button'));

    expect(click).toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('opens the picker from the keyboard with %s', (key) => {
    const { container } = render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    const click = vi.spyOn(picker(container), 'click').mockImplementation(() => {});

    fireEvent.keyDown(screen.getByRole('button'), { key });

    expect(click).toHaveBeenCalled();
  });

  it('leaves any other key to the browser', () => {
    const { container } = render(
      <Dropzone.Root label="Upload">
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    const click = vi.spyOn(picker(container), 'click').mockImplementation(() => {});

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });

    expect(click).not.toHaveBeenCalled();
  });

  it('hands over what was picked, and clears the input so the same file picks again', () => {
    const onDrop = vi.fn();
    const { container } = render(
      <Dropzone.Root label="Upload" onDrop={onDrop}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.change(picker(container), { target: { files: [file('a.torrent', 10)] } });

    expect(onDrop).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.torrent' })]);
    expect(picker(container).value).toBe('');
  });

  it('says nothing when the picker is dismissed without a file', () => {
    const onDrop = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <Dropzone.Root label="Upload" onDrop={onDrop} onReject={onReject}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.change(picker(container), { target: { files: [] } });

    expect(onDrop).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('shrugs off a drop that carries no transfer at all', () => {
    const onDrop = vi.fn();
    render(
      <Dropzone.Root label="Upload" onDrop={onDrop}>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );

    fireEvent.drop(screen.getByRole('button'));

    expect(onDrop).not.toHaveBeenCalled();
  });

  it('does not highlight while it is disabled', () => {
    render(
      <Dropzone.Root label="Upload" disabled>
        <Dropzone.Title>Drop it</Dropzone.Title>
      </Dropzone.Root>,
    );
    const zone = screen.getByRole('button');

    fireEvent.dragOver(zone);

    expect(zone.getAttribute('data-drag-active')).toBeNull();
  });
});
