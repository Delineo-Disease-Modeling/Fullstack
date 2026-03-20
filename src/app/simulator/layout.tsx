import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Simulator' };

export default function SimulatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
