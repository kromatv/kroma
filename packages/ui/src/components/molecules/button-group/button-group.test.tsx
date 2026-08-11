// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { CONTROL, controlRadius } from '#ui/lib/field-shell';
import { onScreen } from '#ui/testing';
import { ButtonGroup } from './button-group';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

const R = `${controlRadius(CONTROL.md)}px`;
const O = '0px';

// Clockwise from the top left, which is how the four corners read as a shape.
const FULL = [R, R, R, R];
const LEFT = [R, O, O, R];
const RIGHT = [O, R, R, O];
const SQUARE = [O, O, O, O];
const TOP = [R, R, O, O];
const BOTTOM = [O, O, R, R];

function corners(el: Element): string[] {
  const css = getComputedStyle(el);
  return [
    css.borderTopLeftRadius,
    css.borderTopRightRadius,
    css.borderBottomRightRadius,
    css.borderBottomLeftRadius,
  ];
}

const member = (label: string) => corners(screen.getByLabelText(label));

const leadingBorder = (label: string) =>
  getComputedStyle(screen.getByLabelText(label)).borderLeftWidth;

describe('a member of a ButtonGroup', () => {
  it('keeps its whole shape when it is the only one', () => {
    render(
      <ButtonGroup.Root label="Lecture">
        <Button variant="outline" label="Lire" />
      </ButtonGroup.Root>,
    );
    expect(member('Lire')).toEqual(FULL);
    expect(leadingBorder('Lire')).toBe('1px');
  });

  it('flattens the corners it shares and drops the border it shares', () => {
    render(
      <ButtonGroup.Root label="Affichage">
        <Button variant="outline" label="Grille" />
        <Button variant="outline" label="Liste" />
        <Button variant="outline" label="Détail" />
      </ButtonGroup.Root>,
    );
    expect(member('Grille')).toEqual(LEFT);
    expect(member('Liste')).toEqual(SQUARE);
    expect(member('Détail')).toEqual(RIGHT);
    expect(leadingBorder('Grille')).toBe('1px');
    expect(leadingBorder('Liste')).toBe(O);
    expect(leadingBorder('Détail')).toBe(O);
  });

  it('flattens along the other axis when the group is vertical', () => {
    render(
      <ButtonGroup.Root orientation="vertical" label="Volume">
        <Button variant="outline" label="Plus" />
        <Button variant="outline" label="Moins" />
      </ButtonGroup.Root>,
    );
    expect(member('Plus')).toEqual(TOP);
    expect(member('Moins')).toEqual(BOTTOM);
    expect(getComputedStyle(screen.getByLabelText('Moins')).borderTopWidth).toBe(O);
  });

  it('lifts itself over its neighbours while focused, so its ring is not overpainted', async () => {
    render(
      <ButtonGroup.Root label="Affichage">
        <Button variant="outline" label="Grille" autoFocus />
        <Button variant="outline" label="Liste" />
      </ButtonGroup.Root>,
    );
    await waitFor(() => expect(getComputedStyle(screen.getByLabelText('Grille')).zIndex).toBe('1'));
    expect(getComputedStyle(screen.getByLabelText('Liste')).zIndex).toBe('0');
  });

  it('wears the group corner rather than its own', () => {
    render(
      <ButtonGroup.Root label="Lecture" radius={4}>
        <Button variant="outline" label="Lire" />
      </ButtonGroup.Root>,
    );
    expect(member('Lire')).toEqual(['4px', '4px', '4px', '4px']);
  });
});

describe('ButtonGroup.Separator', () => {
  it('occupies a slot, so the member beside it is no longer the only one', () => {
    render(
      <ButtonGroup.Root label="Lecture">
        <Button variant="outline" label="Lire" />
        <ButtonGroup.Separator />
      </ButtonGroup.Root>,
    );
    expect(member('Lire')).toEqual(LEFT);
  });

  it('sits between the two halves of a split button', () => {
    render(
      <ButtonGroup.Root label="Abonnement">
        <Button variant="outline" label="Suivre" />
        <ButtonGroup.Separator />
        <Button variant="outline" label="Plus d’options" />
      </ButtonGroup.Root>,
    );
    expect(member('Suivre')).toEqual(LEFT);
    expect(member('Plus d’options')).toEqual(RIGHT);
  });
});

describe('ButtonGroup.Text', () => {
  it('takes part in the shape as a prefix and as a suffix', () => {
    render(
      <ButtonGroup.Root label="Adresse">
        <ButtonGroup.Text>https://</ButtonGroup.Text>
        <Button variant="outline" label="kroma" />
        <ButtonGroup.Text>.tv</ButtonGroup.Text>
      </ButtonGroup.Root>,
    );
    const chip = (text: string) => corners(screen.getByText(text).parentElement as Element);
    expect(chip('https://')).toEqual(LEFT);
    expect(member('kroma')).toEqual(SQUARE);
    expect(chip('.tv')).toEqual(RIGHT);
  });
});

describe('a nested ButtonGroup', () => {
  it('gives its own children fresh positions instead of inheriting one', () => {
    render(
      <ButtonGroup.Root label="Barre d’outils">
        <ButtonGroup.Root label="Zoom">
          <Button variant="outline" label="Moins" />
          <Button variant="outline" label="Plus" />
        </ButtonGroup.Root>
        <ButtonGroup.Root label="Vue">
          <Button variant="outline" label="Grille" />
        </ButtonGroup.Root>
      </ButtonGroup.Root>,
    );
    expect(member('Moins')).toEqual(LEFT);
    expect(member('Plus')).toEqual(RIGHT);
    expect(member('Grille')).toEqual(FULL);
  });

  it('turns the outer group into spaced clusters, so a plain sibling stays whole', () => {
    render(
      <ButtonGroup.Root label="Barre d’outils">
        <Button variant="outline" label="Réglages" />
        <ButtonGroup.Root label="Zoom">
          <Button variant="outline" label="Moins" />
          <Button variant="outline" label="Plus" />
        </ButtonGroup.Root>
      </ButtonGroup.Root>,
    );
    expect(member('Réglages')).toEqual(FULL);
    expect(leadingBorder('Réglages')).toBe('1px');
  });

  it('inherits the size and the corner of the group around it', () => {
    const SM = `${controlRadius(CONTROL.sm)}px`;
    render(
      <ButtonGroup.Root label="Barre d’outils" size="sm">
        <ButtonGroup.Root label="Zoom">
          <Button variant="outline" label="Moins" />
        </ButtonGroup.Root>
      </ButtonGroup.Root>,
    );
    expect(member('Moins')).toEqual([SM, SM, SM, SM]);
  });
});

describe('a child that does not read the shape', () => {
  it('keeps its own, and still counts as a slot', () => {
    render(
      <ButtonGroup.Root label="Affichage">
        <Box radius={30} w={40} testID="plain" />
        <Button variant="outline" label="Liste" />
      </ButtonGroup.Root>,
    );
    expect(corners(screen.getByTestId('plain'))).toEqual(['30px', '30px', '30px', '30px']);
    expect(member('Liste')).toEqual(RIGHT);
  });
});

describe('ButtonGroup accessibility', () => {
  it('names the group and leaves every member its own name', () => {
    render(
      <ButtonGroup.Root label="Affichage">
        <Button variant="outline" label="Grille" />
        <Button variant="outline" label="Liste" />
      </ButtonGroup.Root>,
    );
    expect(screen.getByRole('group', { name: 'Affichage' })).toBeTruthy();
    expect(screen.getByLabelText('Grille')).toBeTruthy();
    expect(screen.getByLabelText('Liste')).toBeTruthy();
  });
});
