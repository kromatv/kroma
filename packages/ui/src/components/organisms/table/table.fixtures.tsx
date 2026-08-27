import { useEffect, useMemo, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Chip } from '#ui/components/atoms/chip';
import { Text } from '#ui/components/atoms/text';
import type { ColorValue } from '#ui/core';
import { type SortColumn, Table, type TableColumn, type TableVariant } from './table';

export const MODULES = [
  { id: 'tv.kroma.torrents', port: '41310', state: 'Running' },
  { id: 'tv.kroma.whisper', port: '41311', state: 'Running' },
  { id: 'tv.kroma.vpn', port: '41312', state: 'Stopped' },
];

export const DOWNLOADS = [
  { name: 'Arrival', state: 'Seeding', added: '2026-08-19', bytes: 8_100_000_000 },
  { name: 'Blade Runner 2049', state: 'Downloading', added: '2026-08-24', bytes: 24_600_000_000 },
  { name: 'Dune', state: 'Seeding', added: '2026-08-24', bytes: 31_200_000_000 },
  { name: 'Heat', state: 'Paused', added: '2026-08-11', bytes: 12_400_000_000 },
  { name: 'Sicario', state: 'Downloading', added: '2026-08-19', bytes: 9_800_000_000 },
];

type Download = (typeof DOWNLOADS)[number];

type Take = { variant?: TableVariant };

const FIELD: Record<string, (row: Download) => string | number> = {
  name: (row) => row.name,
  state: (row) => row.state,
  added: (row) => row.added,
  bytes: (row) => row.bytes,
};

const DOT: Record<string, ColorValue> = {
  Downloading: 'accent',
  Seeding: 'success',
  Paused: 'textDim',
};

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function ordered(rows: readonly Download[], sort: readonly SortColumn[]): Download[] {
  return [...rows].sort((a, b) => {
    for (const { column, direction } of sort) {
      const read = FIELD[column];
      const side = read ? compare(read(a), read(b)) : 0;
      if (side !== 0) return direction === 'asc' ? side : -side;
    }
    return 0;
  });
}

export function query(sort: readonly SortColumn[]): string {
  const order = sort.map((entry) => `${entry.column}:${entry.direction}`).join(',');
  return order ? `GET /api/downloads?sort=${order}` : 'GET /api/downloads';
}

export const COLUMNS: readonly TableColumn[] = [
  { column: 'name', flex: 2, min: 160 },
  { column: 'state', width: 172 },
  { column: 'added', width: 128, from: 'md' },
  { column: 'bytes', width: 92, align: 'end' },
];

function Head() {
  return (
    <Table.Header>
      <Table.Row>
        <Table.Cell>Title</Table.Cell>
        <Table.Cell>State</Table.Cell>
        <Table.Cell>Added</Table.Cell>
        <Table.Cell>Size</Table.Cell>
      </Table.Row>
    </Table.Header>
  );
}

function Rows({ rows }: Readonly<{ rows: readonly Download[] }>) {
  return (
    <Table.Body>
      {rows.map((row) => (
        <Table.Row key={row.name}>
          <Table.Cell>{row.name}</Table.Cell>
          <Table.Cell>
            <Chip label={row.state} size="sm" dot={DOT[row.state]} />
          </Table.Cell>
          <Table.Cell>{row.added}</Table.Cell>
          <Table.Cell>{`${(row.bytes / 1e9).toFixed(1)} GB`}</Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  );
}

export function Columned({ variant, width }: Readonly<Take & { width: number }>) {
  return (
    <Box w={width}>
      <Table.Root variant={variant} label="Downloads" columns={COLUMNS}>
        <Head />
        <Rows rows={DOWNLOADS.slice(0, 3)} />
      </Table.Root>
    </Box>
  );
}

export function SortedByOne({ variant }: Readonly<Take>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([{ column: 'name', direction: 'asc' }]);
  const rows = useMemo(() => ordered(DOWNLOADS, sort), [sort]);
  return (
    <Table.Root
      variant={variant}
      label="Downloads"
      columns={COLUMNS}
      sort={sort}
      onSortChange={setSort}
    >
      <Head />
      <Rows rows={rows} />
    </Table.Root>
  );
}

export function SortedByTwo({ variant }: Readonly<Take>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([
    { column: 'state', direction: 'asc' },
    { column: 'added', direction: 'desc' },
  ]);
  const rows = useMemo(() => ordered(DOWNLOADS, sort), [sort]);
  return (
    <Table.Root
      variant={variant}
      label="Downloads"
      columns={COLUMNS}
      multiple
      sort={sort}
      onSortChange={setSort}
    >
      <Head />
      <Rows rows={rows} />
    </Table.Root>
  );
}

export function ServerSorted({ variant }: Readonly<Take>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([{ column: 'added', direction: 'desc' }]);
  const [rows, setRows] = useState<readonly Download[]>([]);
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    setWaiting(true);
    const answer = setTimeout(() => {
      setRows(ordered(DOWNLOADS, sort));
      setWaiting(false);
    }, 450);
    return () => clearTimeout(answer);
  }, [sort]);
  return (
    <Box gap={10}>
      <Text variant="meta" font="mono" color={waiting ? 'accentText' : 'textDim'}>
        {query(sort)}
      </Text>
      <Table.Root
        variant={variant}
        label="Downloads"
        columns={COLUMNS}
        multiple
        sort={sort}
        onSortChange={setSort}
      >
        <Head />
        <Box opacity={waiting ? 0.35 : 1}>
          <Rows rows={rows} />
        </Box>
      </Table.Root>
    </Box>
  );
}
