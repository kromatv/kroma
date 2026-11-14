import { createFileRoute } from '@tanstack/react-router';
import { SignInPage } from '#web/features/admin/sign-in';

export const Route = createFileRoute('/admin/sign-in')({ component: SignInPage });
