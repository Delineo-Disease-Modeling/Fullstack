'use client';

export default function InstructionBanner({ text }: { text: string }) {
  return (
    <div className="instruction-banner">
      <span className="instruction-banner-icon" aria-hidden="true">
        <i className="bi bi-info-circle" />
      </span>
      <span>{text}</span>
    </div>
  );
}
