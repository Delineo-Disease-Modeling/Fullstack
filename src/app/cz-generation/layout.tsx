import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Convenience Zone Generation' };

export default function CZGenerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
