import { Box } from '@kromatv/ui/kit/atoms/box';
import { Divider } from '@kromatv/ui/kit/atoms/divider';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';

/** A card of `ProgressRow`s, a hairline between each. */
export function ProgressList({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box bg="surface1" border="border" radius="xl" overflow="hidden">
      {Children.toArray(children).map((child, index) => (
        <Fragment key={isValidElement(child) ? child.key : index}>
          {index > 0 ? <Divider /> : null}
          {child}
        </Fragment>
      ))}
    </Box>
  );
}
