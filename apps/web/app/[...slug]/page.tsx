import { AppShell } from '../../components/app-shell';
import { ModuleCrudWorkspace } from '../../components/module-crud-workspace';

export default async function WorkspacePage({
  params,
}: Readonly<{ params: Promise<{ slug: string[] }> }>): Promise<React.ReactElement> {
  const resolvedParams = await params;
  const key = resolvedParams.slug.join('/');

  return (
    <AppShell>
      <ModuleCrudWorkspace moduleKey={key} />
    </AppShell>
  );
}
