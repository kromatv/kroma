import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { partsOf, sortParts } from './parts';

const Title = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Actions = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Other = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Choice = ({ value }: Readonly<{ value: string }>) => value;

const part = (of: typeof Title, children?: ReactNode) => createElement(of, null, children);

const holding = (children: ReactNode) => ({ props: { children } });

describe('sortParts', () => {
  it('hands back one array per part, in the order the parts were given', () => {
    const children = [part(Actions, 'Lire'), part(Title, 'Film')];

    const [titles, actions, rest] = sortParts(children, Title, Actions);

    expect(titles).toMatchObject([holding('Film')]);
    expect(actions).toMatchObject([holding('Lire')]);
    expect(rest).toEqual([]);
  });

  it('keeps the children of one part in the order they were written', () => {
    const children = [part(Title, 'Un'), part(Other, 'Entre'), part(Title, 'Deux')];

    const [titles] = sortParts(children, Title);

    expect(titles).toMatchObject([holding('Un'), holding('Deux')]);
  });

  it('leaves a child that is none of the parts, text included, to the last array', () => {
    const children = ['Texte', part(Other, 'Ailleurs'), part(Title, 'Film')];

    const [titles, rest] = sortParts(children, Title);

    expect(titles).toMatchObject([holding('Film')]);
    expect(rest).toMatchObject(['Texte', holding('Ailleurs')]);
  });

  it('does not look inside a child for a part', () => {
    const wrapped = part(Other, part(Title, 'Film'));

    const [titles, rest] = sortParts(wrapped, Title);

    expect(titles).toEqual([]);
    expect(rest).toHaveLength(1);
  });

  it('drops what React would not render', () => {
    const children = [null, false, undefined, part(Title, 'Film')];

    const [titles, rest] = sortParts(children, Title);

    expect(titles).toMatchObject([holding('Film')]);
    expect(rest).toEqual([]);
  });

  it('hands back empty arrays when there is no child', () => {
    expect(sortParts(undefined, Title, Actions)).toEqual([[], [], []]);
  });
});

describe('partsOf', () => {
  it('hands back the direct children of one part, in the order they were written, with their props', () => {
    const children = [
      createElement(Choice, { value: 'b' }),
      'Texte',
      part(Title, 'Film'),
      createElement(Choice, { value: 'a' }),
    ];

    const choices = partsOf(children, Choice);

    expect(choices.map((choice) => choice.props.value)).toEqual(['b', 'a']);
  });

  it('does not look inside a child for a part', () => {
    const wrapped = part(Other, createElement(Choice, { value: 'a' }));

    expect(partsOf(wrapped, Choice)).toEqual([]);
  });
});
