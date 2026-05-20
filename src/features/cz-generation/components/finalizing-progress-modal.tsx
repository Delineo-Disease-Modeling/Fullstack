'use client';

type FinalizingProgressModalProps = {
  open: boolean;
  progress: number;
  statusMessage: string;
};

export function FinalizingProgressModal({
  open,
  progress,
  statusMessage
}: FinalizingProgressModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="czgen_modal_overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="czgen_modal">
        <p className="czgen_modal_title">Generating convenience zone</p>
        <p className="czgen_modal_subtitle">
          {statusMessage || 'Preparing movement patterns...'}
        </p>
        <div className="czgen_progress_track">
          <div
            className="czgen_progress_fill"
            style={{
              width: `${Math.max(2, Math.min(100, progress))}%`
            }}
          />
        </div>
        <div
          className="mt-2 text-right text-xs font-medium"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {progress}%
        </div>
        <p
          className="mt-3 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          This can take a few minutes. You&apos;ll be taken to the simulator
          automatically once generation is complete.
        </p>
      </div>
    </div>
  );
}
