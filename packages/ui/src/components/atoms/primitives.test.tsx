import type { ReactElement } from 'react';
// @vitest-environment jsdom
//
// Renders the universal primitives through react-native-web and asserts the DOM
// they produce. The same components compile to native views on Apple TV and
// Android TV, so this is the browser half of the "one component, four targets"
// claim; the native half is covered by the pure logic tests (focal, sv, boxStyle)
// plus the platform files' shared contracts.

import { act, cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '#ui/components/molecules/field';
import { Dialog } from '#ui/components/organisms/dialog';
import { radius, typeSpec } from '#ui/core/tokens';
import { CONTROL } from '#ui/lib/field-shell';
import { clearPressGuard } from '#ui/lib/press-guard';
import { onScreen } from '#ui/testing';
import { AVATAR_GRADIENTS, Avatar, gradientFor, initialsOf } from './avatar';
import { Badge } from './badge';
import { Button, buttonVariants } from './button';
import { Chip } from './chip';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { clamp01, Progress } from './progress';
import { Skeleton } from './skeleton';
import { Text } from './text';
import { TextArea } from './text-area';
import { TextField } from './text-field';

// Every kit control is a node of the spatial navigator; a test renders inside
// the same scope the router gives every real screen.
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(() => {
  cleanup();
  clearPressGuard();
});

// react-native-web keeps inline styles only for dynamic values, so a DOM
// assertion has to read the resolved style rather than the style attribute.
const css = (el: Element) => getComputedStyle(el);

// The navigator scope `render` adds contributes no DOM of its own, so the
// disc is the first child.
const disc = (container: HTMLElement) => container.firstElementChild as HTMLElement;

const padlock = (container: HTMLElement) =>
  (container.querySelector('svg') as SVGElement).parentElement as HTMLElement;

// On the browser targets a control is one element, so this is the labelled host itself.
const inner = (label: string) => screen.getByLabelText(label);

describe('Icon', () => {
  it('draws an outline glyph as a stroked svg', () => {
    const { container } = render(<Icon name="check" size={32} color="accent" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('stroke')).toBe('var(--kroma-accent)');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('draws a filled glyph as a painted svg with no stroke', () => {
    const { container } = render(<Icon name="player-play-filled" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('var(--kroma-text)');
    expect(svg?.getAttribute('stroke')).toBe('none');
  });

  it('accepts a raw colour as well as a palette token', () => {
    const { container } = render(<Icon name="x" color="#ABCDEF" />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#ABCDEF');
  });
});

describe('Button', () => {
  it('renders its label and fires onPress', () => {
    const onPress = vi.fn();
    render(<Button label="Play" onPress={onPress} />);
    const el = inner('Play');
    expect(el.textContent).toContain('Play');
    fireEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('paints the amber fill for the primary variant and nothing for ghost', () => {
    render(
      <>
        <Button label="A" variant="primary" />
        <Button label="B" variant="ghost" />
      </>,
    );
    expect(css(inner('A')).backgroundColor).toBe('var(--kroma-accent)');
    // jsdom resolves the `transparent` keyword to its rgba() equivalent.
    expect(css(inner('B')).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('dims and blocks a disabled button', () => {
    const onPress = vi.fn();
    render(<Button label="Off" disabled onPress={onPress} />);
    // A disabled control is not a navigator node at all, so it IS the styled
    // element rather than the view inside one.
    const el = screen.getByLabelText('Off');
    // The FILL fades and the ink row dims, never the element itself: a root
    // opacity would make the element its own backdrop root and blind the
    // frost layer's backdrop-filter (see button.tsx).
    expect(css(el).opacity).not.toBe('0.5');
    expect(css(el).backgroundColor).toBe('var(--kroma-accent-50)');
    expect(css(screen.getByText('Off').parentElement as HTMLElement).opacity).toBe('0.5');
    fireEvent.click(el);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('steps its fill up under the pointer, and back down when it leaves', () => {
    render(
      <>
        <Button label="A" variant="primary" />
        <Button label="B" variant="outline" active />
      </>,
    );
    fireEvent.pointerOver(inner('A'));
    expect(css(inner('A')).backgroundColor).toBe('var(--kroma-accent-hover)');
    fireEvent.pointerOut(inner('A'));
    expect(css(inner('A')).backgroundColor).toBe('var(--kroma-accent)');

    // A toggle that is already on stays AMBER under the cursor: the white wash
    // the other variants hover with would read as it switching itself off.
    fireEvent.pointerOver(inner('B'));
    expect(css(inner('B')).backgroundColor).toBe('var(--kroma-accent-soft-hover)');
  });

  it('deepens under the finger, a step PAST hover rather than a repeat of it', () => {
    const at = (state: Record<string, boolean>) =>
      buttonVariants({ variant: 'primary' }, state).root as Record<string, unknown>;
    expect(at({ hover: true }).backgroundColor).toBe('var(--kroma-accent-hover)');
    expect(at({ hover: true, press: true }).backgroundColor).toBe('var(--kroma-accent-press)');
  });

  it.each(['primary', 'glass', 'ghost', 'danger', 'dangerGhost', 'scrim', 'outline'] as const)(
    'answers a pointer on %s three different ways: rest, hover, pressed',
    (variant) => {
      const at = (state: Record<string, boolean>) => buttonVariants({ variant }, state).root;
      expect(at({ hover: true })).not.toEqual(at({}));
      expect(at({ hover: true, press: true })).not.toEqual(at({ hover: true }));
    },
  );

  it('does not light under the pointer while it is busy', () => {
    render(<Button label="Envoi" loading />);
    fireEvent.pointerOver(inner('Envoi'));
    expect(css(inner('Envoi')).backgroundColor).toBe('var(--kroma-accent)');
  });

  it('renders leading and trailing glyphs', () => {
    const { container } = render(
      <Button label="Regler" icon="settings" iconRight="chevron-right" />,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});

describe('Badge and Chip', () => {
  it('tints a badge with its own hue', () => {
    render(<Badge tone="HDR" />);
    expect(screen.getByText('HDR')).toBeTruthy();
  });

  it('inverts a chip when active', () => {
    render(
      <>
        <Chip label="FR" active />
        <Chip label="EN" />
      </>,
    );
    expect(css(inner('FR')).backgroundColor).toBe('var(--kroma-accent)');
    expect(css(inner('EN')).backgroundColor).not.toBe('var(--kroma-accent)');
  });

  it('lifts a chip under the pointer, up its own ladder either way', () => {
    render(
      <>
        <Chip label="FR" active />
        <Chip label="EN" />
      </>,
    );
    fireEvent.pointerOver(inner('EN'));
    expect(css(inner('EN')).backgroundColor).toBe('var(--kroma-tint-13)');
    // An active chip is a solid accent fill, so it climbs the amber ladder.
    fireEvent.pointerOver(inner('FR'));
    expect(css(inner('FR')).backgroundColor).toBe('var(--kroma-accent-hover)');
  });
});

describe('IconButton', () => {
  it('brightens its fill under the pointer, and an active one stays amber', () => {
    render(
      <>
        <IconButton icon="x" label="Fermer" />
        <IconButton icon="eye" label="Vu" active />
      </>,
    );
    expect(css(inner('Fermer')).backgroundColor).toBe('var(--kroma-tint-12)');

    fireEvent.pointerOver(inner('Fermer'));
    expect(css(inner('Fermer')).backgroundColor).toBe('var(--kroma-tint-18)');
    fireEvent.pointerOut(inner('Fermer'));
    expect(css(inner('Fermer')).backgroundColor).toBe('var(--kroma-tint-12)');

    fireEvent.pointerOver(inner('Vu'));
    expect(css(inner('Vu')).backgroundColor).toBe('var(--kroma-accent-soft-hover)');
  });
});

describe('TextField', () => {
  it('lands the caret from a press anywhere on the field, not only on the entry', () => {
    render(
      <TextField
        value=""
        onValueChange={() => {}}
        icon="search"
        physicalKeyboard
        autoFocus={false}
        label="Search"
      />,
    );
    const input = screen.getByLabelText('Search');
    const field = input.parentElement as HTMLElement;
    expect(document.activeElement).not.toBe(input);
    // A press on the field's own surface (its padding, its icon), released there.
    fireEvent.mouseDown(field);
    fireEvent.mouseUp(field);
    expect(document.activeElement).toBe(input);
  });

  it('seats the television value on the shell line, not the body role', () => {
    // Without a keyboard the value is drawn text, and it has to measure like the
    // entry it replaces: `body`'s own 1.55 ratio overflows the content row, and
    // native clips a line box that does not fit (the web only spills), so the
    // value sat wrong on tvOS alone.
    render(<TextField value="192.168.1.124:4040" label="Address" size="sm" />);
    const value = css(screen.getByText('192.168.1.124:4040'));
    expect(value.fontSize).toBe(`${CONTROL.sm.fontSize}px`);
    expect(value.lineHeight).toBe(`${CONTROL.sm.line}px`);
  });
});

describe('TextArea', () => {
  it('is a real multi-line entry, named by its field, reporting what is typed', () => {
    const onChange = vi.fn();
    render(
      <Field.Root label="Message">
        <Field.Textarea rows={3} physicalKeyboard onValueChange={onChange} />
      </Field.Root>,
    );
    const entry = screen.getByLabelText('Message');
    expect(entry.tagName).toBe('TEXTAREA');
    // `rows` is a floor in the kit's own line box, not a DOM rows attribute:
    // one line of a TextArea is one line of a TextField, so the two line up in
    // a form.
    expect(css(entry).minHeight).toBe('72px');
    fireEvent.change(entry, { target: { value: 'the server reboots at nine' } });
    expect(onChange).toHaveBeenCalledWith('the server reboots at nine');
  });

  it('renders a display with a caret, not an input, where there is no keyboard', () => {
    render(<TextArea value="the server reboots at nine" label="Message" />);
    // A television must not be able to focus the entry at all: focusing it is
    // what summons the platform IME over the app.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('the server reboots at nine')).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('derives initials from the first and last name', () => {
    expect(initialsOf('Marie Curie')).toBe('MC');
    expect(initialsOf('Jean Claude Van Damme')).toBe('JD');
    // A display name is very often a username, so punctuation separates too.
    expect(initialsOf('jean.dupont')).toBe('JD');
    expect(initialsOf('ada_lovelace')).toBe('AL');
    expect(initialsOf('marie-curie')).toBe('MC');
    // A single word keeps two of its own letters rather than one lonely capital.
    expect(initialsOf('cher')).toBe('CH');
    expect(initialsOf('  ')).toBe('?');
  });

  it('gives a seed a stable gradient and different seeds different ones', () => {
    expect(gradientFor('user-1')).toBe(gradientFor('user-1'));
    expect(AVATAR_GRADIENTS).toContain(gradientFor('user-1'));
  });

  it('shows the initials until a photo has actually arrived', async () => {
    const { container, rerender } = render(<Avatar name="Marie Curie" />);
    expect(screen.getByText('MC')).toBeTruthy();
    rerender(<Avatar name="Marie Curie" src="https://example.test/a.jpg" />);
    // Still there while the photo loads, and again if it fails: a profile is
    // never a blank disc.
    expect(screen.getByText('MC')).toBeTruthy();
    const img = container.querySelector('img:not([aria-hidden])') as HTMLImageElement;
    fireEvent.load(img);
    // The reveal waits a frame so the browser paints the transparent state its
    // CSS transition starts from; the initials hold until it does.
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(null));
      });
    });
    expect(screen.queryByText('MC')).toBeNull();
    fireEvent.error(img);
    expect(screen.getByText('MC')).toBeTruthy();
  });

  it('rounds to an exact circle, half the size, rather than a clamped radius', () => {
    const { container } = render(<Avatar name="Marie Curie" size={96} circle />);
    expect(css(disc(container)).borderTopLeftRadius).toBe('48px');
  });

  it('keeps one roundness the same SHAPE at every size', () => {
    // The whole point of a ratio: the corner is 1/4 of the disc at 48 and at
    // 160, where a pixel radius could only have been right at one of them.
    const small = render(<Avatar name="Marie Curie" size={48} roundness={0.25} />);
    expect(css(disc(small.container)).borderTopLeftRadius).toBe('12px');
    cleanup();
    const big = render(<Avatar name="Marie Curie" size={160} roundness={0.25} />);
    expect(css(disc(big.container)).borderTopLeftRadius).toBe('40px');
  });

  it('caps roundness at a circle, whatever it is handed', () => {
    const { container } = render(<Avatar name="Marie Curie" size={96} roundness={4} />);
    expect(css(disc(container)).borderTopLeftRadius).toBe('48px');
  });

  it('keeps the padlock inside the corner it is drawn against', () => {
    // The badge used to sit 8px in whatever the shape was, so a round avatar's
    // own corner cropped it. The inset now follows the corner: barely anything
    // on a square, ~15% of the size on a circle.
    const square = render(<Avatar name="Marie Curie" size={96} roundness={0} locked />);
    expect(css(padlock(square.container)).right).toBe('8px');
    cleanup();
    const round = render(<Avatar name="Marie Curie" size={96} circle locked />);
    expect(css(padlock(round.container)).right).toBe('14px');
  });

  it('never clips its own children, which is what cropped the padlock', () => {
    const { container } = render(<Avatar name="Marie Curie" size={96} circle locked />);
    // `Img` clips the art to the corner itself, so the disc has no business
    // clipping anything: the badge is a sibling of the art, over it.
    expect(css(disc(container)).overflow).not.toBe('hidden');
  });
});

describe('Progress', () => {
  it('clamps out-of-range and non-finite values', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
  });

  it('sizes the fill to the value, as the inset it eases', () => {
    const { container } = render(<Progress value={0.25} />);
    const fill = container.querySelector('[role="progressbar"] > *') as HTMLElement;
    expect(css(fill).left).toBe('0px');
    expect(css(fill).right).toBe('75%');
  });
});

describe('Skeleton', () => {
  const lines = (container: HTMLElement) => [...(disc(container).children as never as Element[])];

  it('is one washed block by default, sized by the layout shorthands', () => {
    const { container } = render(<Skeleton w={220} h={22} />);
    const block = disc(container);
    expect(css(block).width).toBe('220px');
    expect(css(block).height).toBe('22px');
    expect(css(block).borderTopLeftRadius).toBe(`${radius.sm}px`);
    expect(block.children).toHaveLength(0);
  });

  it('stands a text run in the exact height the real text will take', () => {
    const { container } = render(<Skeleton shape="text" variant="body" lines={3} />);
    const { size, ratio } = typeSpec.body;
    const lineHeight = Math.round(size * ratio);
    const bar = Math.round(size * 0.7);
    const leading = lineHeight - bar;
    const block = disc(container);
    // Bars plus gaps plus half a leading at each end: three lines of `body`.
    expect(css(block).paddingTop).toBe(`${leading / 2}px`);
    expect(css(block).gap).toBe(`${leading}px`);
    expect(lines(container)).toHaveLength(3);
    expect(css(lines(container)[0] as Element).height).toBe(`${bar}px`);
  });

  it('leaves the last line of a paragraph short, and a lone line full', () => {
    const many = render(<Skeleton shape="text" lines={3} />);
    expect(css(lines(many.container)[2] as Element).width).toBe('60%');
    expect(css(lines(many.container)[0] as Element).width).not.toBe('60%');
    cleanup();
    const one = render(<Skeleton shape="text" lines={1} />);
    expect(css(lines(one.container)[0] as Element).width).not.toBe('60%');
  });

  it('takes the card ratios for poster and still, and a diameter for circle', () => {
    const poster = render(<Skeleton shape="poster" w={140} />);
    expect(css(disc(poster.container)).aspectRatio).toBe(`${2 / 3} / 1`);
    cleanup();
    const still = render(<Skeleton shape="still" w={240} />);
    expect(css(disc(still.container)).aspectRatio).toBe(`${16 / 9} / 1`);
    cleanup();
    const avatar = render(<Skeleton shape="circle" size={42} />);
    expect(css(disc(avatar.container)).width).toBe('42px');
    expect(css(disc(avatar.container)).height).toBe('42px');
    expect(css(disc(avatar.container)).borderTopLeftRadius).toBe('21px');
  });

  it('lets a caller override the shape it was handed', () => {
    const { container } = render(<Skeleton shape="poster" w={140} radius="pill" />);
    expect(css(disc(container)).borderTopLeftRadius).toBe(`${radius.pill}px`);
  });
});

describe('Text', () => {
  it('applies the design type role and palette colour', () => {
    render(
      <Text variant="h1" color="accent">
        Films
      </Text>,
    );
    const el = screen.getByText('Films');
    expect(css(el).fontSize).toBe('38px');
    expect(css(el).color).toBe('var(--kroma-accent)');
  });

  it('rescales the line height when a style overrides the font size', () => {
    // Keeping the role's absolute line height would clip the glyph on native.
    render(<Text style={{ fontSize: 28 }}>1</Text>);
    expect(css(screen.getByText('1')).lineHeight).toBe('43px');
  });

  it('leaves an explicit line height alone', () => {
    render(<Text style={{ fontSize: 28, lineHeight: 30 }}>2</Text>);
    expect(css(screen.getByText('2')).lineHeight).toBe('30px');
  });

  it('rescales the tracking when a style overrides the font size', () => {
    // The overline is authored in em; keeping 13px's absolute tracking at 14px
    // is the drift that had every 10-foot screen writing the style by hand.
    render(
      <Text variant="overlineTv" style={{ fontSize: 14 }}>
        3
      </Text>,
    );
    expect(css(screen.getByText('3')).letterSpacing).toBe('3.08px');
  });

  it('leaves an explicit tracking alone', () => {
    render(
      <Text variant="overlineTv" style={{ fontSize: 14, letterSpacing: 1 }}>
        4
      </Text>,
    );
    expect(css(screen.getByText('4')).letterSpacing).toBe('1px');
  });

  it('lays a string out from the shorthand vocabulary', () => {
    render(
      <Text mt={24} px={8} maxW={640} textAlign="center">
        Sur le vif
      </Text>,
    );
    const el = screen.getByText('Sur le vif');
    expect(css(el).marginTop).toBe('24px');
    expect(css(el).paddingLeft).toBe('8px');
    expect(css(el).maxWidth).toBe('640px');
    expect(css(el).textAlign).toBe('center');
  });

  it('keeps the shorthands off the host element', () => {
    render(<Text maxW={200}>Rien</Text>);
    const el = screen.getByText('Rien');
    expect(el.getAttribute('maxW')).toBeNull();
    expect(el.getAttribute('textAlign')).toBeNull();
  });

  it('still lets `style` win over a shorthand', () => {
    render(
      <Text mt={24} style={{ marginTop: 4 }}>
        Dernier mot
      </Text>,
    );
    expect(css(screen.getByText('Dernier mot')).marginTop).toBe('4px');
  });
});

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Dialog.Root open={false} title="Supprimer" />);
    expect(screen.queryByText('Supprimer')).toBeNull();
  });

  it('declares a focus scope so the D-pad cannot leave the panel', () => {
    render(
      <Dialog.Root open title="Supprimer">
        <Button label="OK" />
      </Dialog.Root>,
    );
    const panel = document.querySelector('[data-focus-scope]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[role="button"]')).not.toBeNull();
    expect(screen.getByText('Supprimer')).toBeTruthy();
  });

  it('rounds the panel with the design radius', () => {
    render(<Dialog.Root open title="Titre" />);
    const panel = document.querySelector('[data-focus-scope]') as HTMLElement;
    expect(css(panel).borderTopLeftRadius).toBe(`${radius['2xl']}px`);
  });
});
