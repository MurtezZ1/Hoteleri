import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OdeoniFlow PMS',
  description: 'Modern hotel and property management SaaS.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
