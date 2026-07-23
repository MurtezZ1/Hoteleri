import { AppShell } from '../../components/app-shell';
import { RoomsRateWorkspace } from '../../components/rooms-rate-workspace';

export default function RoomsPage(): React.ReactElement {
  return (
    <AppShell>
      <RoomsRateWorkspace />
    </AppShell>
  );
}
