'use client';

import {
  CLUSTER_ALGORITHM_MANUAL,
  CLUSTER_ALGORITHM_OPTIONS
} from '@/features/cz-generation/constants';

type AlgorithmGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AlgorithmGuideModal({
  open,
  onClose
}: AlgorithmGuideModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="czgen_modal_overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="algorithm-guide-title"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div className="czgen_modal" style={{ width: 'min(34rem, 92vw)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="algorithm-guide-title" className="czgen_modal_title">
              Algorithm Guide
            </p>
            <p className="czgen_modal_subtitle">
              Start with Mobility Prune unless the zone needs manual city
              selection or diagnostic tracing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="czgen_btn czgen_btn--sm"
            style={{ flexShrink: 0 }}
          >
            Close
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {CLUSTER_ALGORITHM_OPTIONS.map((option) => {
            const manual = CLUSTER_ALGORITHM_MANUAL[option.value];
            return (
              <div
                key={option.value}
                className="border-l-4 px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--color-primary-blue-soft)',
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-muted)',
                  borderRadius: '0 8px 8px 0'
                }}
              >
                <div
                  className="flex flex-wrap items-center gap-2 font-semibold"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <span>{option.label}</span>
                  {manual.recommended && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: 'rgba(22,163,74,0.1)',
                        color: '#166534'
                      }}
                    >
                      default
                    </span>
                  )}
                </div>
                <div className="mt-1">{manual.summary}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
