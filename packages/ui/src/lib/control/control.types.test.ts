import { describe, expectTypeOf, it } from 'vitest';
import type { ChangeDetails, ControlOf, ControlProps, Reasons } from './control-types';
import { defineControl } from './define-control';
import { useControl } from './use-control.hook';

const slider = defineControl('slider', {
  state: { value: 0, dragging: false },
  options: { min: 0, max: 100 },
  actions: {
    toEnd: ({ max }) => ({ value: max }),
    grab: ({ dragging }) => ({ dragging: !dragging }),
    jump: (_now, to: number, by?: number) => ({ value: to + (by ?? 0) }),
  },
});

type SliderProps = ControlProps<typeof slider>;

const useSlider = (props: SliderProps & { label: string; tone?: 'accent' }) =>
  useControl(slider, props);

// @ts-expect-error a string is not what `value` holds
const useWrongProp = () => useControl(slider, { value: 'high' });

const defineWrongKey = () =>
  defineControl('wrong', {
    state: { open: false },
    // @ts-expect-error `opened` is not a key of the state
    actions: { toggle: ({ open }) => ({ opened: !open }) },
  });

type Mounted = ReturnType<typeof useSlider>;

describe('the types a definition gives', () => {
  it('are the three props of each state key and one per option', () => {
    expectTypeOf<SliderProps['value']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<SliderProps['defaultDragging']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<NonNullable<SliderProps['onValueChange']>>().toEqualTypeOf<
      (
        next: number,
        details: ChangeDetails<Reasons<{ toEnd: []; grab: []; jump: [to: number, by?: number] }>>,
      ) => void
    >();
    expectTypeOf<SliderProps['max']>().toEqualTypeOf<number | undefined>();
  });

  it('are the state, the options and the actions of the control', () => {
    expectTypeOf<Mounted[0]['value']>().toEqualTypeOf<number>();
    expectTypeOf<Mounted[0]['min']>().toEqualTypeOf<number>();
    expectTypeOf<Mounted[0]['toEnd']>().toEqualTypeOf<() => boolean>();
    expectTypeOf<Mounted[0]>().toEqualTypeOf<ControlOf<typeof slider>>();
  });

  it('leave the component the props the control did not read', () => {
    expectTypeOf<Mounted[1]>().toEqualTypeOf<
      Omit<SliderProps & { label: string; tone?: 'accent' }, keyof SliderProps>
    >();
    expectTypeOf<Mounted[1]['label']>().toEqualTypeOf<string>();
  });

  it('give each state key a setter of its own type', () => {
    expectTypeOf<Mounted[0]['setValue']>().toEqualTypeOf<
      (next: number, reason?: string) => boolean
    >();
    expectTypeOf<Mounted[0]['setDragging']>().parameter(0).toEqualTypeOf<boolean>();
  });

  it('give an action the arguments it declares after the state', () => {
    expectTypeOf<Mounted[0]['jump']>().toEqualTypeOf<(to: number, by?: number) => boolean>();
  });

  it('name the control’s own actions among the reasons of a change', () => {
    type Reason = Parameters<NonNullable<SliderProps['onValueChange']>>[1]['reason'];

    expectTypeOf<'toEnd' | 'grab' | 'jump' | 'set'>().toExtend<Reason>();
  });

  it('refuse a prop whose type is not the key’s', () => {
    expectTypeOf(useWrongProp).toBeFunction();
  });

  it('refuse an action that changes a key the state does not have', () => {
    expectTypeOf(defineWrongKey).toBeFunction();
  });
});
