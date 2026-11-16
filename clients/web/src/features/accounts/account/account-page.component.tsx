import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, EmptyState, type IconName, SegmentGroup } from '@kromatv/ui/kit';
import { type CSSProperties, useEffect, useRef } from 'react';
import { AccountHeader } from '#web/features/accounts/account/account-header.component';
import {
  ACCOUNT_SECTIONS,
  type AccountSection,
} from '#web/features/accounts/account/account-sections';
import { IdentitiesCard } from '#web/features/accounts/account/identities-card.component';
import { NotificationsCard } from '#web/features/accounts/account/notifications-card.component';
import { PasskeysCard } from '#web/features/accounts/account/passkeys-card.component';
import { PinCard } from '#web/features/accounts/account/pin-card.component';
import { PreferencesCard } from '#web/features/accounts/account/preferences-card.component';
import { ProfileSection } from '#web/features/accounts/account/profile-section.component';
import { SecurityCard } from '#web/features/accounts/account/security-card.component';
import { SessionsCard } from '#web/features/accounts/account/sessions-card.component';
import { useAuth } from '#web/shared/lib/auth';
import { PageFrame } from '#web/shared/ui';

const LABEL: Record<AccountSection, MessageKey> = {
  profile: 'account.profile',
  preferences: 'account.preferences',
  notifications: 'account.sectionNotifications',
  security: 'account.sectionSecurity',
  devices: 'account.devices',
};

const ICON: Record<AccountSection, IconName> = {
  profile: 'user',
  preferences: 'adjustments-horizontal',
  notifications: 'bell',
  security: 'shield-lock',
  devices: 'devices',
};

const COLUMN = 920;

function isSection(value: string): value is AccountSection {
  return (ACCOUNT_SECTIONS as readonly string[]).includes(value);
}

interface AccountPageProps {
  section: AccountSection;
  onSection: (section: AccountSection) => void;
}

const STRIP: CSSProperties = { overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' };

function AccountTabs({ section, onSection }: Readonly<AccountPageProps>) {
  const t = useT();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current
      ?.querySelector(`[aria-checked="true"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [section]);

  return (
    <Box mt={28} mb={24} align="flex-start">
      <div ref={strip} style={STRIP}>
        <SegmentGroup.Root
          value={section}
          onValueChange={(next) => {
            if (isSection(next)) {
              onSection(next);
            }
          }}
          label={t('account.title')}
        >
          {ACCOUNT_SECTIONS.map((one) => (
            <SegmentGroup.Item key={one} value={one} icon={ICON[one]}>
              <SegmentGroup.Label>{t(LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </div>
    </Box>
  );
}

export function AccountPage({ section, onSection }: Readonly<AccountPageProps>) {
  const t = useT();
  const { user } = useAuth();

  if (!user) {
    return (
      <PageFrame>
        <EmptyState.Root icon="user-off">
          <EmptyState.Title>{t('account.signedOut')}</EmptyState.Title>
        </EmptyState.Root>
      </PageFrame>
    );
  }

  return (
    <PageFrame pt={20}>
      <Box w="100%" maxW={COLUMN} self="center">
        <AccountHeader />
        <AccountTabs section={section} onSection={onSection} />
        {/* Keyed by account id so switching profiles re-seeds every form. */}
        <Box key={user.id} gap={16}>
          {section === 'profile' ? <ProfileSection /> : null}
          {section === 'preferences' ? <PreferencesCard /> : null}
          {section === 'notifications' ? <NotificationsCard /> : null}
          {section === 'security' ? (
            <>
              <SecurityCard />
              <PasskeysCard />
              <IdentitiesCard />
              <PinCard />
            </>
          ) : null}
          {section === 'devices' ? <SessionsCard /> : null}
        </Box>
      </Box>
    </PageFrame>
  );
}
