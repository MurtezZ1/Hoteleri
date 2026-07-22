import { AppShell } from '../../components/app-shell';
import { WhatsAppInbox } from '../../components/whatsapp-inbox';

export default function MessagesPage(): React.ReactElement {
  return (
    <AppShell>
      <WhatsAppInbox />
    </AppShell>
  );
}
