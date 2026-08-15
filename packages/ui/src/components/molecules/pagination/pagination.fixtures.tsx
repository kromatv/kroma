import { type ReactNode, useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import type { ControlSize } from '#ui/lib/field-shell';

import { Pagination } from './pagination';

export interface DemoProps {
  pageCount?: number;
  siblings?: number;
  size?: ControlSize;
  start?: number;
}

export function Demo({ pageCount = 24, siblings, size, start = 1 }: Readonly<DemoProps>) {
  const [page, setPage] = useState(start);
  return (
    <Pagination.Root
      label="Releases"
      page={page}
      pageCount={pageCount}
      siblings={siblings}
      size={size}
      onPageChange={setPage}
    />
  );
}

export function Composed({ pageCount = 24, siblings, size }: Readonly<DemoProps>) {
  const [page, setPage] = useState(6);
  return (
    <Pagination.Root
      label="Releases"
      page={page}
      pageCount={pageCount}
      siblings={siblings}
      size={size}
      onPageChange={setPage}
    >
      <Pagination.Status />
      <Pagination.Previous />
      <Pagination.Pages />
      <Pagination.Next />
    </Pagination.Root>
  );
}

export function Labelled({ children, name }: Readonly<{ children: ReactNode; name: string }>) {
  return (
    <Box gap={10}>
      <Text variant="overline" color="textDim">
        {name}
      </Text>
      {children}
    </Box>
  );
}
