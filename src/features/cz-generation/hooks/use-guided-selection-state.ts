import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  GUIDED_REGION_PALETTE,
  GUIDED_SEED_STYLE
} from '@/features/cz-generation/constants';
import { dedupeCbgList, sameStringArray } from '@/features/cz-generation/helpers';
import type {
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  GuidedSelectionStyle
} from '@/features/cz-generation/types';
import { normalizeCbgId } from '@/lib/cz-geo';

type UseGuidedSelectionStateParams = {
  guidedSelectionMode: boolean;
  guidedDestinations: GuidedDestinationCandidate[];
  selectedGuidedDestinationIds: string[];
  guidedMetadata: GuidedSecondOrderMetadata | null;
  guidedSeedCbgs: string[];
  setSelectedCBGs: Dispatch<SetStateAction<string[]>>;
  setTotalPopulation: (value: number) => void;
};

export function useGuidedSelectionState({
  guidedSelectionMode,
  guidedDestinations,
  selectedGuidedDestinationIds,
  guidedMetadata,
  guidedSeedCbgs,
  setSelectedCBGs,
  setTotalPopulation
}: UseGuidedSelectionStateParams) {
  const guidedSelectedDestinations = useMemo(
    () =>
      guidedDestinations.filter((destination) =>
        selectedGuidedDestinationIds.includes(destination.unit_id)
      ),
    [guidedDestinations, selectedGuidedDestinationIds]
  );

  const guidedSelectionSummary = useMemo(() => {
    const selectedLinkedOutboundFlow = guidedSelectedDestinations.reduce(
      (sum, destination) =>
        sum +
        (destination.gateway_cbgs ?? []).reduce(
          (inner, detail) => inner + Number(detail.seed_outbound_flow ?? 0),
          0
        ),
      0
    );
    const selectedLinkedOutboundShare = Math.min(
      1,
      Number(guidedMetadata?.total_seed_external_outbound_flow ?? 0) > 0
        ? selectedLinkedOutboundFlow /
            Number(guidedMetadata?.total_seed_external_outbound_flow ?? 0)
        : 0
    );
    const selectedExternalBidirectionalShare = Math.min(
      1,
      guidedSelectedDestinations.reduce(
        (sum, destination) =>
          sum + Number(destination.share_of_seed_external_bidirectional ?? 0),
        0
      )
    );
    const selectedSeedMovementShare = Math.min(
      1,
      guidedSelectedDestinations.reduce(
        (sum, destination) =>
          sum + Number(destination.share_of_seed_total_movement ?? 0),
        0
      )
    );
    const selectedPopulation =
      Number(guidedMetadata?.seed_population ?? 0) +
      guidedSelectedDestinations.reduce(
        (sum, destination) => sum + Number(destination.population ?? 0),
        0
      );

    return {
      selectedLinkedOutboundFlow,
      selectedLinkedOutboundShare,
      selectedExternalBidirectionalShare,
      selectedSeedMovementShare,
      externalRemainderShare: Math.max(
        0,
        1 - selectedExternalBidirectionalShare
      ),
      selectedPopulation
    };
  }, [guidedMetadata, guidedSelectedDestinations]);

  const guidedSeedLabel = useMemo(() => {
    if (guidedMetadata?.seed_city_labels?.length) {
      return guidedMetadata.seed_city_labels.join(', ');
    }
    if (guidedMetadata?.seed_zip_codes?.length) {
      return guidedMetadata.seed_zip_codes.join(', ');
    }
    return `${guidedSeedCbgs.length} seed CBGs`;
  }, [guidedMetadata, guidedSeedCbgs]);

  const guidedSelectedDestinationSummary = useMemo(() => {
    const labels = guidedSelectedDestinations
      .map((destination) => destination.label)
      .filter(Boolean);
    if (labels.length === 0) {
      return 'Seed only';
    }
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
  }, [guidedSelectedDestinations]);

  const guidedStyleByUnitId = useMemo(() => {
    const styleMap = new Map<string, GuidedSelectionStyle>();
    guidedSelectedDestinations.forEach((destination, index) => {
      styleMap.set(
        destination.unit_id,
        GUIDED_REGION_PALETTE[index % GUIDED_REGION_PALETTE.length]
      );
    });
    return styleMap;
  }, [guidedSelectedDestinations]);

  const guidedSelectionStyleByCbg = useMemo(() => {
    if (!guidedSelectionMode) {
      return null;
    }

    const styleMap = new Map<string, GuidedSelectionStyle>();
    guidedSeedCbgs.forEach((cbg) => {
      const normalized = normalizeCbgId(cbg);
      if (normalized) {
        styleMap.set(normalized, GUIDED_SEED_STYLE);
      }
    });
    guidedSelectedDestinations.forEach((destination) => {
      const style =
        guidedStyleByUnitId.get(destination.unit_id) || GUIDED_SEED_STYLE;
      destination.cbgs.forEach((cbg) => {
        const normalized = normalizeCbgId(cbg);
        if (normalized) {
          styleMap.set(normalized, style);
        }
      });
    });
    return styleMap;
  }, [
    guidedSeedCbgs,
    guidedSelectedDestinations,
    guidedSelectionMode,
    guidedStyleByUnitId
  ]);

  useEffect(() => {
    if (!guidedSelectionMode) {
      return;
    }

    const nextSelectedCBGs = dedupeCbgList([
      ...guidedSeedCbgs,
      ...guidedSelectedDestinations.flatMap((destination) => destination.cbgs)
    ]);

    setSelectedCBGs((prev) =>
      sameStringArray(prev, nextSelectedCBGs) ? prev : nextSelectedCBGs
    );
    setTotalPopulation(guidedSelectionSummary.selectedPopulation);
  }, [
    guidedSeedCbgs,
    guidedSelectedDestinations,
    guidedSelectionMode,
    guidedSelectionSummary.selectedPopulation,
    setSelectedCBGs,
    setTotalPopulation
  ]);

  return {
    guidedSelectedDestinations,
    guidedSelectionSummary,
    guidedSeedLabel,
    guidedSelectedDestinationSummary,
    guidedStyleByUnitId,
    guidedSelectionStyleByCbg
  };
}
