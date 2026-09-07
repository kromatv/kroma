import { ModuleFailed, ModuleLoading, useFetch, useModuleApi, useT } from '__SDK__';
import { PageHeader, Surface, Text } from '@kroma/ui/kit';
import { Hello } from './schemas';

export default function __PAGE__() {
  const t = useT();
  const api = useModuleApi();
  const hello = useFetch(['hello'], () => api.get('/hello', Hello));

  if (hello.failed) return <ModuleFailed />;
  if (!hello.data) return <ModuleLoading />;
  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('page.title')}</PageHeader.Title>
      </PageHeader.Root>
      <Surface elevated border="border" px={22} py={20} mt={24}>
        <Text>{t('page.hello', { answer: hello.data.answer })}</Text>
      </Surface>
    </>
  );
}
