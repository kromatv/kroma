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
  Focusable,
  Icon,
  type IconName,
  Surface,
  Text,
  Tooltip,
  useTheme,
} from '@kroma/ui/kit';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import {
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_PRESS,
  ADMIN_TABLE_ROW,
} from '#web/features/admin/web-style';

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
   *  stop rather than a row of them. The row still reads as its own cells: the
   *  press layer takes its name from them. */
  onPress?: () => void;
  children: ReactNode;
}

/** One record. */
function Row({ onPress, children }: Readonly<TableRowProps>) {
  const style = useTemplate('Row');
  const id = useId();
  if (!onPress) {
    return (
      <div className={ADMIN_TABLE_ROW} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div className={ADMIN_TABLE_ROW} data-pressable="true" id={id} style={style}>
      <button type="button" className={ADMIN_TABLE_PRESS} aria-labelledby={id} onClick={onPress} />
      {children}
    </div>
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

const ACTION: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderWidth: 1,
  cursor: 'pointer',
};

interface TableActionProps {
  /** The hue the whole control is built from: its glyph, its edge and its two
   *  fills. */
  tone: ColorToken;
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** A shortcut sitting in a row, next to whatever the row's own press does. */
function Action({ tone, icon, label, onPress }: Readonly<TableActionProps>) {
  const radius = useTheme().radius.sm;
  return (
    <Tooltip label={label}>
      <Focusable
        label={label}
        onPress={onPress}
        style={{
          ...ACTION,
          borderRadius: radius,
          borderColor: color(`${tone}/30`),
          backgroundColor: color(`${tone}/10`),
        }}
        states={{ hover: { bg: `${tone}/20` } }}
      >
        <Icon name={icon} size={14} color={tone} stroke={2.6} />
      </Focusable>
    </Tooltip>
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
