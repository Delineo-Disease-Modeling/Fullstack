'use client';

import { Info } from 'lucide-react';

interface InstructionBannerProps {
  text?: string;
  children?: React.ReactNode;
}

export default function InstructionBanner({ text, children }: InstructionBannerProps) {
  return (
    <div className="instruction-banner">
      <span className="instruction-banner-icon" aria-hidden="true">
        <Info size={16} />
      </span>
      <span>{children ?? text}</span>
    </div>
  );
}
