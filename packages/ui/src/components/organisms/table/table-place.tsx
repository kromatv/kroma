import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { type Place, TableContext } from './table-context';

function parts(children: ReactNode): ReactElement[] {
  return Children.toArray(children).filter(isValidElement);
}

function Placed({ items, places }: Readonly<{ items: ReactElement[]; places: Place[] }>) {
  return (
    <>
      {items.map((child, at) => (
        <TableContext.Provider key={child.key ?? at} value={places[at] as Place}>
          {child}
        </TableContext.Provider>
      ))}
    </>
  );
}

export { Placed, parts };
