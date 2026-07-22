import { AppShell } from '../../components/app-shell';
import { ReservationCalendarWorkspace } from '../../components/reservation-calendar-workspace';

export default function CalendarPage(): React.ReactElement {
  return (
    <AppShell>
      <ReservationCalendarWorkspace />
    </AppShell>
  );
}
