'use client';

type GuidedTermsHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

export function GuidedTermsHelpModal({
  open,
  onClose
}: GuidedTermsHelpModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="czgen_modal_overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-terms-title"
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
      <div className="czgen_modal czgen_modal--wide">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="guided-terms-title" className="czgen_modal_title">
              How Guided Ranking Works
            </p>
            <p className="czgen_modal_subtitle">
              The city cards use plain-language labels. This panel maps those
              labels back to the ranking terms and explains which values drive
              ordering versus selection context.
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

        <div className="mt-4 flex flex-col gap-3 text-sm text-gray-700">
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Connection (<code>coupling</code>)
            </div>
            <div className="mt-1">
              Distance-adjusted two-way connection between the seed and a city.
              This is the main ranking score, so the list is ordered by this
              value.
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
              {`bidirectional_flow = outbound_flow + inbound_flow

coupling =
  bidirectional_flow / (1 + distance_km / distance_scale_km)`}
            </pre>
            <div className="mt-2">
              <span className="font-semibold">Terms:</span>{' '}
              <code>outbound_flow</code> is travel from the seed to the city,
              aggregated across the full city approximation.{' '}
              <code>inbound_flow</code> is travel from the city back to the
              seed, also aggregated across the full city approximation.{' '}
              <code>distance_km</code> is the distance from the seed to the
              selected linked CBG layer for that city.{' '}
              <code>distance_scale_km</code> is the distance penalty scale.
            </div>
          </div>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Trips Leaving Seed (
              <code>share_of_seed_external_outbound</code>)
            </div>
            <div className="mt-1">
              On each city card, this is the portion of trips leaving the seed
              that go to that full connected city. It remains a city-level
              ranking/context metric.
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
              {`share_of_seed_external_outbound =
  outbound_flow / total_seed_external_outbound_flow`}
            </pre>
            <div className="mt-2">
              <span className="font-semibold">Terms:</span>{' '}
              <code>total_seed_external_outbound_flow</code> only counts trips
              that leave the seed for outside destinations. The numerator is
              the full city approximation&apos;s outbound flow, not only the
              linked CBG subset.
            </div>
          </div>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Trips Leaving Seed In Summary
            </div>
            <div className="mt-1">
              In the footer and selection summary, this is computed only from
              the selected linked CBG subset, summed across the chosen cities.
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
              {`linked_subset_trips_leaving_seed =
  selected_linked_outbound_flow / total_seed_external_outbound_flow`}
            </pre>
            <div className="mt-2">
              <span className="font-semibold">Terms:</span>{' '}
              <code>selected_linked_outbound_flow</code> is the sum of
              <code>seed_outbound_flow</code> across the linked CBGs kept
              explicit in the zone.
            </div>
          </div>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Linked CBGs (<code>cbg_count</code>)
            </div>
            <div className="mt-1">
              Number of linked CBGs that would be kept explicit for this city.
              This is selection context, not part of the ranking formula.
            </div>
          </div>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Added Population (<code>population</code>)
            </div>
            <div className="mt-1">
              Estimated explicit population contributed by that city&apos;s
              linked CBG layer. This helps judge zone size, but it also is not
              part of the ranking formula.
            </div>
          </div>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
            <div className="font-semibold text-[#1f2937]">
              Linked Coverage (
              <code>captured_bidirectional_flow_share</code>)
            </div>
            <div className="mt-1">
              Portion of the city&apos;s two-way seed connection that is
              covered by the selected linked CBGs. This is the note shown at the
              bottom of each card.
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
              {`captured_bidirectional_flow_share =
  captured_gateway_bidirectional_flow / bidirectional_flow`}
            </pre>
            <div className="mt-2">
              <span className="font-semibold">Terms:</span>{' '}
              <code>captured_gateway_bidirectional_flow</code> is the two-way
              travel covered by the chosen linked CBG subset for that city.{' '}
              <code>bidirectional_flow</code> is the full city-level two-way
              travel between the seed and that city.
            </div>
          </div>
          <div className="czgen_info text-xs">
            The list is ranked by <code>coupling</code>, shown as{' '}
            <span className="font-semibold">Connection</span>. The other values
            help decide whether that city is worth keeping in the explicit zone
            once you see its linked CBG count and population impact. If you want
            linked-CBG-only metrics, use the summary UI&apos;s{' '}
            <span className="font-semibold">Trips Leaving Seed</span> for
            outbound capture and the city card&apos;s{' '}
            <code>captured_bidirectional_flow_share</code> for two-way coverage.
          </div>
        </div>
      </div>
    </div>
  );
}
