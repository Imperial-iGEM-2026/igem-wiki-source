import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Prion Collective — An iGEM project wiki',
  description:
    'Explore the project, engineering, research, human practices, and team behind a prion-focused iGEM wiki.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
