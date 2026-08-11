import { story } from '@kroma/workbench/story';
import { type ReactNode, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { Pagination } from './pagination';

interface DemoProps {
  pageCount: number;
  siblings: number;
  size: ControlSize;
  start?: number;
}

function Demo({ pageCount, siblings, size, start = 1 }: Readonly<DemoProps>) {
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

function Composed({ pageCount, siblings, size }: Readonly<DemoProps>) {
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

function Labelled({ children, name }: Readonly<{ children: ReactNode; name: string }>) {
  return (
    <Box gap={10}>
      <Txt variant="overline" color="textDim">
        {name}
      </Txt>
      {children}
    </Box>
  );
}

export default story({
  name: 'Pagination',
  group: 'Actions',
  docs: 'Paging controls for a list that arrives one page at a time. A **navigation** landmark to assistive tech, named by `label`, whose current page carries `aria-current="page"` and reads as filled rather than merely tinted. The page run is windowed - first and last are always there, an ellipsis marks what is hidden - and the window is the same width on every page, so the row never reflows under the cursor. Previous and next stay in place and go dim at the ends rather than disappearing. Every target is a `<Focusable>` inside a `<FocusRegion>`, so the D-pad walks the row on a television exactly as Tab walks it in a browser.',
  usage: `<Pagination.Root page={page} pageCount={20} onPageChange={setPage} label="Releases" />

// Write the row yourself when the default one is not enough:
<Pagination.Root page={page} pageCount={20} onPageChange={setPage} label="Releases">
  <Pagination.Status />
  <Pagination.Previous />
  <Pagination.Pages />
  <Pagination.Next />
</Pagination.Root>`,
  guidelines: {
    do: [
      'Name it: `label` is what a screen reader announces for the landmark.',
      'Keep `siblings` at 1 unless the row has real room - it is what makes the window one D-pad sweep.',
      'Translate the accessible names through `pageLabel` and a `label` on each part.',
    ],
    dont: [
      "Don't hide previous and next at the ends - the row would reflow under the pointer.",
      "Don't reach for it when the whole list fits: that is a scroll, not a page.",
    ],
  },
  matrix: false,
  args: { pageCount: 24, siblings: 1, size: 'md' },
  controls: {
    pageCount: { min: 1, max: 60, step: 1 },
    siblings: { min: 0, max: 3, step: 1 },
    size: ['sm', 'md', 'tv'],
  },
  render: ({ pageCount, siblings, size }) => (
    <Demo
      key={`${pageCount}-${siblings}-${size}`}
      pageCount={pageCount}
      siblings={siblings}
      size={size}
    />
  ),
  scenes: [
    {
      name: 'The ends',
      docs: 'On the first page previous is dim, on the last one next is; both keep their place, so the numbers never slide sideways.',
      render: ({ pageCount, siblings, size }) => (
        <Box gap={28}>
          <Labelled name="first page">
            <Demo
              key={`first-${pageCount}-${siblings}-${size}`}
              pageCount={pageCount}
              siblings={siblings}
              size={size}
              start={1}
            />
          </Labelled>
          <Labelled name="mid range">
            <Demo
              key={`mid-${pageCount}-${siblings}-${size}`}
              pageCount={pageCount}
              siblings={siblings}
              size={size}
              start={Math.ceil(pageCount / 2)}
            />
          </Labelled>
          <Labelled name="last page">
            <Demo
              key={`last-${pageCount}-${siblings}-${size}`}
              pageCount={pageCount}
              siblings={siblings}
              size={size}
              start={pageCount}
            />
          </Labelled>
        </Box>
      ),
    },
    {
      name: 'Short range',
      docs: 'Under eight pages nothing is hidden, so no ellipsis is drawn at all.',
      render: ({ siblings, size }) => (
        <Box gap={28}>
          <Labelled name="7 pages">
            <Demo key={`seven-${siblings}-${size}`} pageCount={7} siblings={siblings} size={size} />
          </Labelled>
          <Labelled name="1 page">
            <Demo key={`one-${siblings}-${size}`} pageCount={1} siblings={siblings} size={size} />
          </Labelled>
        </Box>
      ),
    },
    {
      name: 'Composed',
      docs: 'The reason the parts are named: a row the props API could not describe, here with the count spelled out ahead of the controls.',
      render: ({ pageCount, siblings, size }) => (
        <Composed
          key={`composed-${pageCount}-${siblings}-${size}`}
          pageCount={pageCount}
          siblings={siblings}
          size={size}
        />
      ),
    },
  ],
});
