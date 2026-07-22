import { AppShell } from '../../components/app-shell';
import { FrontDeskWorkspace } from '../../components/front-desk-workspace';

export default function FrontDeskPage(): React.ReactElement {
  return (
    <AppShell>
      <FrontDeskWorkspace />
    </AppShell>
  );
}
