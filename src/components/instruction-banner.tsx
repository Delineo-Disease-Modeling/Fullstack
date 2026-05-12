'use client';

interface InstructionBannerProps {
  text?: string;
  children?: React.ReactNode;
}

export default function InstructionBanner({ text, children }: InstructionBannerProps) {
  return (
    <div className="instruction-banner">
      <span className="instruction-banner-icon" aria-hidden="true">
        <i className="bi bi-info-circle" />
      </span>
      <span>{children ?? text}</span>
    </div>
  );
}
