import { TABULAR } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Button, Divider, Legend, Row, Text } from '@kroma/ui/kit';

export function PipelineFooter({
  start,
  perPage,
  total,
  page,
  pages,
  onPrev,
  onNext,
}: Readonly<{
  start: number;
  perPage: number;
  total: number;
  page: number;
  pages: number;
  onPrev: () => void;
  onNext: () => void;
}>) {
  const t = useT();
  return (
    <>
      <Divider color="tint/6" />
      <Row between wrap gap={16} px={20} py={14} bg="bg">
        <Row wrap gap={16}>
          <Text variant="meta" color="textDim" style={TABULAR}>
            {(start + 1).toLocaleString()}–{Math.min(start + perPage, total).toLocaleString()} /{' '}
            {total.toLocaleString()}
          </Text>
          <Legend.Root>
            <Legend.Item color="success">{t('pipeline.st.done')}</Legend.Item>
            <Legend.Item color="accent">{t('pipeline.st.running')}</Legend.Item>
            <Legend.Item color="tint/30">{t('pipeline.st.pending')}</Legend.Item>
            <Legend.Item color="danger">{t('pipeline.st.failed')}</Legend.Item>
          </Legend.Root>
        </Row>
        <Row gap={10}>
          <Pager dir="prev" disabled={page <= 0} onClick={onPrev} label={t('pipeline.prev')} />
          <Text variant="meta" color="textDim" style={TABULAR}>
            {t('pipeline.page')} {page + 1} / {pages.toLocaleString()}
          </Text>
          <Pager
            dir="next"
            disabled={page >= pages - 1}
            onClick={onNext}
            label={t('pipeline.next')}
          />
        </Row>
      </Row>
    </>
  );
}

function Pager({
  dir,
  disabled,
  onClick,
  label,
}: Readonly<{ dir: 'prev' | 'next'; disabled: boolean; onClick: () => void; label: string }>) {
  return (
    <Button
      variant="glass"
      size="sm"
      icon={dir === 'prev' ? 'chevron-left' : undefined}
      iconRight={dir === 'next' ? 'chevron-right' : undefined}
      label={label}
      onPress={onClick}
      disabled={disabled}
    />
  );
}
