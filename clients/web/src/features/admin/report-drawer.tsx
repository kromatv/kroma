// Slide-in report drawer: subject identity (category + status + kind), the
// reporter + date, the free-text message, a deep-link to the title's fiche, and
// the triage actions (resolve / dismiss / reopen / delete).

import type { Report, ReportStatus } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar, Box, Button, color, Divider, Drawer, IconButton, Row, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { Pill } from '#web/features/admin/pill';
import { categoryMeta, kindLabelKey, soft, statusMeta } from '#web/features/admin/report-meta';
import { SCROLL_PANE } from '#web/features/admin/web-style';

// Shares the row like the old `flex-1` CTAs.
const FLEX_1 = { flex: 1 } as const;

function Header({ report, onClose }: Readonly<{ report: Report; onClose: () => void }>) {
  const t = useT();
  const cat = categoryMeta(report.category);
  const st = statusMeta(report.status);
  return (
    <>
      <Box px={24} py={20}>
        <Row between mb={16}>
          <Text variant="overline" color="textDim">
            {t('reports.sheet')}
          </Text>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={onClose} />
        </Row>
        <Row wrap gap={8} mb={10}>
          <Pill ink={cat.color} bg={soft(cat.color)} variant="overline">
            {t(cat.labelKey)}
          </Pill>
          <Pill ink={st.color} bg={soft(st.color)} variant="overline">
            {t(st.labelKey)}
          </Pill>
          <Text variant="overline" color="textDim">
            {t(kindLabelKey(report.subjectKind))}
          </Text>
        </Row>
        <Text variant="h2" accessibilityRole="header">
          {report.subjectTitle}
        </Text>
      </Box>
      <Divider color="tint/7" />
    </>
  );
}

// Open with `await ReportDrawer.call({ report, canManage, onResolve, ... })`.
// The action callbacks perform the mutation + parent list refresh + toast, so
// the queue keeps updating live while the drawer stays open.
export const ReportDrawer = createCallable<
  {
    report: Report;
    canManage: boolean;
    onResolve: (r: Report) => Promise<void>;
    onDismiss: (r: Report) => Promise<void>;
    onReopen: (r: Report) => Promise<void>;
    onDelete: (r: Report) => Promise<void>;
  },
  void
>(({ call, report: initial, canManage, onResolve, onDismiss, onReopen, onDelete }) => {
  const t = useT();
  const navigate = useNavigate();
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  // react-call keeps us mounted for `unmountingDelay` ms after `call.end()`,
  // which is the window the kit Drawer's slide-out plays in.
  const close = () => call.end();

  // Reflect the new status locally; the parent reloads the list behind us.
  // Failures leave the report untouched (the callback surfaced its own toast).
  const run = (fn: (r: Report) => Promise<void>, next: ReportStatus) => {
    setBusy(true);
    fn(report)
      .then(() => setReport({ ...report, status: next }))
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const del = () => {
    void onDelete(report);
    close();
  };

  // Movies + shows have a fiche route; an episode item has no standalone page.
  const FICHE_ROUTES = { movie: '/movie/$id', show: '/show/$id' } as const;
  const ficheTo =
    report.subjectKind === 'movie' || report.subjectKind === 'show'
      ? FICHE_ROUTES[report.subjectKind]
      : null;

  return (
    <Drawer
      open={!call.ended}
      onClose={close}
      title={t('reports.sheet')}
      width={460}
      panelStyle={DRAWER_FILL}
    >
      <Header report={report} onClose={close} />

      <div style={SCROLL_PANE}>
        <Box px={24} py={20}>
          <Text variant="overline" color="textDim" mb={12}>
            {t('reports.reportedBy')}
          </Text>
          <Row gap={12} px={16} py={14} radius="lg" bg="surface1" border="tint/7">
            <Avatar name={report.reportedByName ?? '?'} size={34} circle shadow={false} />
            <Box minW={0}>
              <Text variant="label" lines={1}>
                {report.reportedByName ?? t('reports.unknownUser')}
              </Text>
              <Text variant="meta" color="textDim">
                {new Date(report.createdAt).toLocaleDateString()}{' '}
                {new Date(report.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </Box>
          </Row>

          {report.message ? (
            <Box mt={16} px={16} py={14} radius="lg" bg="surface1" border="tint/7">
              <Text variant="meta" color="textMuted">
                {report.message}
              </Text>
            </Box>
          ) : (
            <Text variant="meta" color="textDim" mt={16}>
              {t('reports.noMessage')}
            </Text>
          )}

          {ficheTo ? (
            <Row mt={16} self="flex-start">
              <Button
                variant="glass"
                size="sm"
                icon="external-link"
                label={t('reports.viewTitle')}
                onPress={() => navigate({ to: ficheTo, params: { id: report.subjectId } })}
              />
            </Row>
          ) : null}
        </Box>
      </div>

      {canManage ? (
        <>
          <Divider color="tint/7" />
          <Row gap={10} px={24} py={18}>
            {report.status === 'open' ? (
              <>
                <Button
                  icon="check"
                  label={t('reports.actionResolve')}
                  onPress={() => run(onResolve, 'resolved')}
                  loading={busy}
                  style={FLEX_1}
                />
                <Button
                  variant="glass"
                  icon="x"
                  label={t('reports.actionDismiss')}
                  onPress={() => run(onDismiss, 'dismissed')}
                  disabled={busy}
                  style={FLEX_1}
                />
              </>
            ) : (
              <Button
                variant="glass"
                icon="arrow-back-up"
                label={t('reports.actionReopen')}
                onPress={() => run(onReopen, 'open')}
                disabled={busy}
                style={FLEX_1}
              />
            )}
            <IconButton
              control="md"
              icon="trash"
              label={t('reports.actionDelete')}
              onPress={del}
              disabled={busy}
            />
          </Row>
        </>
      ) : null}
    </Drawer>
  );
}, 400);

// The drawers' darker fill, kept from the hand-rolled asides they replace.
const DRAWER_FILL = { backgroundColor: color('bg') } as const;
