import { type ReactNode, type Ref, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Pagination, paginate } from '#ui/components/molecules/pagination';
import { SegmentedControl } from '#ui/components/molecules/segmented-control';
import { Select } from '#ui/components/molecules/select';
import { SearchKeyboard } from '#ui/components/organisms/keyboard';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { type IconName, iconNames } from '#ui/lib/glyph';
import { iconCategories } from '#ui/lib/icon-catalog';
import { type IconHit, searchIcons } from '#ui/lib/icon-search';

// Rendering thousands of glyphs at once locks the workbench up for seconds,
// and far longer on a television.
const PAGE = 120;

const REMOTE = Platform.isTV;

const EVERY_CATEGORY = 'all';

const SIZES = [
  { value: '18', label: '18' },
  { value: '26', label: '26' },
  { value: '36', label: '36' },
  { value: '48', label: '48' },
] as const;

// The grid scrolls inside the article instead of lengthening it, so the box,
// the count and the pager stay put while a page is read. Not on a television:
// its tiles take no focus and it has no pointer, so a nested area is one
// nothing could move - there the grid sits in the page the D-pad already walks.
//
// What the window keeps for everything else: the article's own heading and
// prose, the search bar and count above the grid, the pager below.
const AROUND_GRID = 500;
const LEAST_GRID = 280;

const MATCHED_TAGS = 3;

/** Every glyph the kit can draw, searchable by name and - where a workbench has
 * loaded the catalogue (`setIconCatalog`) - by Tabler's own tags and category. */
function IconBrowser() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(EVERY_CATEGORY);
  const [size, setSize] = useState('26');
  const [page, setPage] = useState(1);
  const all = iconNames();
  const categories = iconCategories();
  const hits = useMemo(
    () =>
      searchIcons(all, query, {
        category: category === EVERY_CATEGORY ? undefined : category,
      }),
    [all, query, category],
  );
  const tagged = useMemo(() => hits.filter((hit) => hit.tags.length > 0).length, [hits]);
  const shown = paginate(hits, page, PAGE);

  const grid = useRef<ScrollView>(null);
  const toTop = () => grid.current?.scrollTo({ y: 0, animated: false });

  const search = (next: string) => {
    setQuery(next);
    setPage(1);
    toTop();
  };
  const narrow = (next: string) => {
    setCategory(next);
    setPage(1);
    toTop();
  };
  const turnTo = (next: number) => {
    setPage(next);
    toTop();
  };

  return (
    <Box radius="lg" bg="surface1" style={s.frame}>
      <Box gap={space[3]} px={space[4]} py={space[4]} style={s.bar}>
        <Box row wrap gapX={space[5]} gapY={space[3]} align="flex-end">
          <Named label="Search">
            <Field.Root
              label="Search the glyphs"
              hideLabel
              value={query}
              onValueChange={search}
              w={280}
            >
              <Field.Input
                icon="search"
                type="search"
                placeholder="chevrn, playpause, delete…"
                physicalKeyboard={!REMOTE}
              />
            </Field.Root>
          </Named>
          {categories.length > 0 ? (
            <Named label="Category">
              <Select.Root label="Category" value={category} onValueChange={narrow}>
                <Select.Trigger />
                <Select.Item value={EVERY_CATEGORY}>Every category</Select.Item>
                {categories.map((name) => (
                  <Select.Item key={name} value={name}>
                    {name}
                  </Select.Item>
                ))}
              </Select.Root>
            </Named>
          ) : null}
          <Named label="Glyph size (px)">
            <SegmentedControl.Root
              label="Glyph size in pixels"
              value={size}
              options={SIZES}
              onValueChange={setSize}
            />
          </Named>
        </Box>
        {REMOTE ? <SearchKeyboard size="tv" value={query} onValueChange={search} /> : null}
        <Text variant="meta" color="textDim">
          {summarize({
            matched: shown.total,
            total: all.length,
            tagged,
            first: shown.first,
            last: shown.last,
          })}
        </Text>
      </Box>
      <Box p={space[4]}>
        {shown.items.length === 0 ? (
          <Box py={space[10]} center>
            <Text variant="body" color="textDim">
              {`No glyph matches "${query}".`}
            </Text>
          </Box>
        ) : (
          <Grid ref={grid}>
            {shown.items.map((hit) => (
              <Glyph key={hit.name} hit={hit} size={Number(size)} />
            ))}
          </Grid>
        )}
      </Box>
      {shown.pageCount > 1 ? (
        <Box px={space[4]} py={space[3]} align="center" style={s.pager}>
          <Pagination.Root
            label="Glyph pages"
            page={shown.page}
            pageCount={shown.pageCount}
            onPageChange={turnTo}
          />
        </Box>
      ) : null}
    </Box>
  );
}

// Three different affordances sit in this bar, and a segmented control of bare
// numbers reads as pagination until something says what the numbers are.
function Named({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box gap={space[1]}>
      <Text variant="overline" color="textDim">
        {label}
      </Text>
      {children}
    </Box>
  );
}

function Grid({ children, ref }: Readonly<{ children: ReactNode; ref: Ref<ScrollView> }>) {
  const window = useWindowDimensions();
  const tiles = (
    <Box row wrap gapX={space[3]} gapY={space[5]}>
      {children}
    </Box>
  );
  if (REMOTE) return tiles;
  return (
    <ScrollView ref={ref} style={{ maxHeight: Math.max(LEAST_GRID, window.height - AROUND_GRID) }}>
      {tiles}
    </ScrollView>
  );
}

function Glyph({ hit, size }: Readonly<{ hit: IconHit<IconName>; size: number }>) {
  return (
    <Box w={104} align="center" gap={space[2]}>
      <Box h={52} center>
        <Icon name={hit.name} size={size} />
      </Box>
      <Text variant="meta" color="textDim" lines={1} style={s.caption}>
        {hit.name}
      </Text>
      {hit.tags.length > 0 ? (
        <Text variant="meta" color="accentText" lines={1} style={s.caption}>
          {hit.tags.slice(0, MATCHED_TAGS).join(', ')}
        </Text>
      ) : null}
    </Box>
  );
}

interface Summary {
  matched: number;
  total: number;
  tagged: number;
  first: number;
  last: number;
}

function summarize({ matched, total, tagged, first, last }: Readonly<Summary>): string {
  const head = matched === total ? `${total} glyphs` : `${matched} of ${total} glyphs`;
  const range = matched > last - first + 1 ? ` · showing ${first}-${last}` : '';
  return tagged > 0 ? `${head}${range} · ${tagged} matched by tag` : `${head}${range}`;
}

const s = styles({
  frame: { borderWidth: 1, borderColor: 'border', overflow: 'hidden' },
  bar: { borderBottomWidth: 1, borderBottomColor: 'border' },
  pager: { borderTopWidth: 1, borderTopColor: 'border' },
  caption: { textAlign: 'center' },
});

export { IconBrowser };
