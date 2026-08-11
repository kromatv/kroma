// The admin tables: columns that must line up across every row.
//
// That is a real CSS grid, which React Native has none of, so the kit carries no
// <Table> and this stays in the app (components/DESIGN.md §8). The grid itself
// lives in `clients/web/src/styles.css` under `.admin-table-*`; a table states
// only its column template, which reaches the rows as a custom property.

import {
  Box,
  type BoxProps,
  type ColorToken,
  color,
  Icon,
  type IconName,
  Surface,
  Text,
  useTheme,
} from '@kroma/ui/kit';
import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { TextStyle } from 'react-native';
import { ADMIN_TABLE_HEAD, ADMIN_TABLE_ROW } from '#web/features/admin/web-style';

/** Numerals that line up from row to row, for a date or a count column. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const TableContext = createContext<CSSProperties | null>(null);

const WIDE = { wide: 'true' } as const;

function useTemplate(part: string): CSSProperties {
  const template = useContext(TableContext);
  if (!template) throw new Error(`<Table.${part}> must be used inside <Table.Root>`);
  return template;
}

interface TableRootProps {
  /** The template every row aligns on from `md` up, as a `grid-template-columns`
   *  value. */
  columns: string;
  /** The template below `md`, where the columns marked `wide` have dropped out.
   *  Defaults to the title column plus one trailing column. */
  narrow?: string;
  children: ReactNode;
}

function Root({ columns, narrow, children }: Readonly<TableRootProps>) {
  const template = useMemo(
    () => ({ '--admin-table-columns': columns, '--admin-table-narrow': narrow }) as CSSProperties,
    [columns, narrow],
  );
  return (
    <TableContext.Provider value={template}>
      <Surface elevated pad="none" overflow="hidden" radius="xl">
        {children}
      </Surface>
    </TableContext.Provider>
  );
}

/** The heading band above the rows. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={ADMIN_TABLE_HEAD} style={useTemplate('Header')}>
      {children}
    </div>
  );
}

interface TableRowProps {
  /** Makes the whole row the control, so it is one pointer target and one tab
   *  stop rather than a row of them. */
  onPress?: () => void;
  children: ReactNode;
}

/** One record. */
function Row({ onPress, children }: Readonly<TableRowProps>) {
  const style = useTemplate('Row');
  if (!onPress) {
    return (
      <div className={ADMIN_TABLE_ROW} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button type="button" className={ADMIN_TABLE_ROW} style={style} onClick={onPress}>
      {children}
    </button>
  );
}

interface TableCellProps extends Omit<BoxProps, 'children'> {
  /** Drops out of the table below `md`, where there is no room for it. */
  wide?: boolean;
  children?: ReactNode;
}

/** One column of one row. */
function Cell({ wide, children, ...box }: Readonly<TableCellProps>) {
  return (
    <Box minW={0} dataSet={wide ? WIDE : undefined} {...box}>
      {children}
    </Box>
  );
}

/** A column's name, in the header band. */
function Column({ wide, children }: Readonly<{ wide?: boolean; children?: ReactNode }>) {
  return (
    <Cell wide={wide}>
      <Text variant="overline" color="textDim">
        {children}
      </Text>
    </Cell>
  );
}

const ACTION: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderWidth: 1,
  borderStyle: 'solid',
  cursor: 'pointer',
  transition: 'background-color var(--dur-fast) var(--ease-out)',
};

interface TableActionProps {
  /** The hue the whole control is built from: its glyph, its edge and its two
   *  fills. */
  tone: ColorToken;
  icon: IconName;
  label: string;
  onPress: () => void;
}

/**
 * A shortcut inside a pressable row.
 *
 * Not an <IconButton>: the row is already the control, and a `<button>` cannot
 * hold another one, so this is a span that stops the row's press rather than a
 * second real button.
 */
function Action({ tone, icon, label, onPress }: Readonly<TableActionProps>) {
  const [hover, setHover] = useState(false);
  const radius = useTheme().radius.sm;
  const fire = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    onPress();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: cannot be a native <button> because it lives inside the row's <button>
    <span
      role="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      onClick={fire}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        fire(event);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...ACTION,
        borderRadius: radius,
        borderColor: color(`${tone}/30`),
        background: color(hover ? `${tone}/20` : `${tone}/10`),
      }}
    >
      <Icon name={icon} size={14} color={tone} stroke={2.6} />
    </span>
  );
}

/**
 * An aligned admin table.
 *
 * ```tsx
 * <Table.Root columns="minmax(0,1fr) 190px 76px">
 *   <Table.Header>
 *     <Table.Column>Titre</Table.Column>
 *     <Table.Column wide>Demandeur</Table.Column>
 *     <Table.Column />
 *   </Table.Header>
 *   <Table.Row onPress={open}>…</Table.Row>
 * </Table.Root>
 * ```
 */
const Table = { Root, Header, Row, Cell, Column, Action };

export type { TableActionProps, TableCellProps, TableRootProps, TableRowProps };
export { Table };
