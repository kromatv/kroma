import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { issueText } from '#site/lib/issue-text';
import type { Issue } from '#site/lib/views';

/** What the checks found in a translation: errors in the destructive tone, warnings in the warning tone. */
export function MessageIssues({ issues }: Readonly<{ issues: readonly Issue[] }>) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <Column gap={4}>
      {issues.map((issue) => {
        const tone = issue.level === 'error' ? 'danger' : 'accentText';
        return (
          <Row key={`${issue.code}:${issue.detail ?? ''}`} gap={6} align="flex-start">
            <Icon
              name={issue.level === 'error' ? 'alert-circle' : 'alert-triangle'}
              size={15}
              color={tone}
            />
            <Text variant="meta" color={tone}>
              {issueText(issue)}
            </Text>
          </Row>
        );
      })}
    </Column>
  );
}
