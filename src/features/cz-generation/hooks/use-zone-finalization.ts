import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  exportCzMapHtml,
  finalizeConvenienceZone
} from '@/features/cz-generation/api';
import {
  CLUSTER_ALGORITHM_OPTIONS,
  GUIDED_HARD_EXPLICIT_POPULATION,
  type ClusterAlgorithm
} from '@/features/cz-generation/constants';
import {
  dateOnlyToUtcIso,
  getLengthHours
} from '@/features/cz-generation/helpers';
import type {
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  GuidedSelectionSummary
} from '@/features/cz-generation/types';
import { useSession } from '@/lib/auth-client';
import { normalizeCbgId } from '@/lib/cz-geo';
import {
  createGuestZoneClaimToken,
  rememberGuestZoneClaim
} from '@/lib/guest-zone-claims';
import useSimSettings, { type ConvenienceZone } from '@/stores/simsettings';

type Phase = 'input' | 'edit' | 'finalizing';

type UseZoneFinalizationParams = {
  selectedCBGs: string[];
  startDate: string;
  endDate: string;
  guidedSelectionMode: boolean;
  guidedSelectionSummary: GuidedSelectionSummary;
  description: string;
  setDescription: (value: string) => void;
  cityName: string;
  location: string;
  seedCBG: string;
  seedCbgIds: string[];
  clusterAlgorithm: ClusterAlgorithm;
  mobilityPruneMinSeedCapturePct: number;
  isGuidedSecondOrderAlgorithm: boolean;
  minPop: number;
  useTestData: boolean;
  guidedMetadata: GuidedSecondOrderMetadata | null;
  guidedSelectedDestinations: GuidedDestinationCandidate[];
  seedGuardDistanceKm: number;
  mapCenter: [number, number] | null;
  setError: (value: string) => void;
  setPhase: (value: Phase) => void;
};

async function fetchZoneById(
  zoneId: number,
  guestClaimToken?: string | null
): Promise<ConvenienceZone | null> {
  try {
    const response = await fetch(`/api/convenience-zones/${zoneId}`, {
      headers: guestClaimToken
        ? { 'X-Delineo-Guest-Zone-Claims': guestClaimToken }
        : {}
    });
    if (!response.ok) {
      return null;
    }
    const json = await response.json().catch(() => ({}));
    const zone = json?.data as ConvenienceZone | undefined;
    return zone?.ready ? zone : null;
  } catch {
    return null;
  }
}

function waitForZoneReady(
  zoneId: number,
  onProgress: (percent: number) => void,
  guestClaimToken?: string | null
): Promise<ConvenienceZone | null> {
  return new Promise((resolve) => {
    let done = false;
    let currentProgress = 15;
    let eventSource: EventSource | null = null;

    const finish = (zone: ConvenienceZone | null) => {
      if (done) {
        return;
      }
      done = true;
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (eventSource) {
        eventSource.close();
      }
      resolve(zone);
    };

    const progressTimer = window.setInterval(() => {
      if (done) {
        return;
      }
      currentProgress = Math.min(
        92,
        currentProgress + (92 - currentProgress) * 0.05
      );
      onProgress(Math.round(currentProgress));
    }, 1000);

    const checkReady = async () => {
      const zone = await fetchZoneById(zoneId, guestClaimToken);
      if (zone) {
        finish(zone);
      }
    };

    const pollTimer = window.setInterval(checkReady, 5000);

    try {
      eventSource = new EventSource('/api/convenience-zones/events');
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload?.type === 'zone-ready' &&
            Number(payload.zone_id) === zoneId
          ) {
            checkReady();
          }
        } catch {
          // Ignore non-JSON heartbeats.
        }
      };
      eventSource.onerror = () => {
        // Polling remains as fallback.
      };
    } catch {
      // EventSource may be unavailable; polling will still run.
    }

    checkReady();
  });
}

export function useZoneFinalization({
  selectedCBGs,
  startDate,
  endDate,
  guidedSelectionMode,
  guidedSelectionSummary,
  description,
  setDescription,
  cityName,
  location,
  seedCBG,
  seedCbgIds,
  clusterAlgorithm,
  mobilityPruneMinSeedCapturePct,
  isGuidedSecondOrderAlgorithm,
  minPop,
  useTestData,
  guidedMetadata,
  guidedSelectedDestinations,
  seedGuardDistanceKm,
  mapCenter,
  setError,
  setPhase
}: UseZoneFinalizationParams) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const setSettings = useSimSettings((state) => state.setSettings);
  const [savingHtmlMap, setSavingHtmlMap] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState(0);
  const [finalizeStatusMessage, setFinalizeStatusMessage] = useState('');

  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      setError('Please select at least one CBG');
      return;
    }

    if (isPending) {
      setError(
        'Please wait while we check whether this zone should be saved to your account.'
      );
      return;
    }

    const lengthHours = getLengthHours(startDate, endDate);
    if (!lengthHours || lengthHours <= 0) {
      setError('End date must be after start date.');
      return;
    }

    if (
      guidedSelectionMode &&
      guidedSelectionSummary.selectedPopulation >
        GUIDED_HARD_EXPLICIT_POPULATION
    ) {
      setError(
        `Guided explicit population is ${Number(
          guidedSelectionSummary.selectedPopulation
        ).toLocaleString()}, which is above the supported cap of ${GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()}. Remove some connected cities before finalizing.`
      );
      return;
    }

    setPhase('finalizing');
    setError('');
    setFinalizeProgress(5);
    setFinalizeStatusMessage('Creating convenience zone...');

    try {
      const trimmedDescription = String(description ?? '').trim();
      const now = new Date();
      const algorithmLabel =
        CLUSTER_ALGORITHM_OPTIONS.find(
          (option) => option.value === clusterAlgorithm
        )?.label || clusterAlgorithm;
      const normalizedSeedCbgIds = Array.from(
        new Set(seedCbgIds.map((cbg) => normalizeCbgId(cbg)).filter(Boolean))
      );

      const generatedDescription = [
        `Auto-generated on ${now.toLocaleString()}`,
        `Location: ${cityName || location || 'N/A'}`,
        `Seed CBG: ${seedCBG || normalizedSeedCbgIds[0] || 'N/A'}`,
        ...(normalizedSeedCbgIds.length > 1
          ? [`Seed CBGs: ${normalizedSeedCbgIds.join(', ')}`]
          : []),
        `Algorithm: ${algorithmLabel}`,
        clusterAlgorithm === 'mobility_prune'
          ? `Minimum seed movement captured: ${Number(
              mobilityPruneMinSeedCapturePct || 0
            ).toFixed(0)}%`
          : isGuidedSecondOrderAlgorithm
            ? 'Minimum population filter: not used in guided connected cities mode'
            : `Minimum population: ${Number(minPop || 0).toLocaleString()}`,
        `Date range: ${startDate} to ${endDate}`,
        `CBGs in zone: ${selectedCBGs.length}`,
        `Test data mode: ${useTestData ? 'Yes' : 'No'}`
      ];

      if (isGuidedSecondOrderAlgorithm && guidedMetadata) {
        const selectedLabels = guidedSelectedDestinations.map(
          (destination) => destination.label
        );
        generatedDescription.push(
          `Seed region: ${
            guidedMetadata.seed_city_labels?.join(', ') ||
            guidedMetadata.seed_zip_codes?.join(', ') ||
            `${guidedMetadata.seed_cbgs.length} seed CBGs`
          }`
        );
        generatedDescription.push(
          `Selected connected cities: ${
            selectedLabels.length ? selectedLabels.join(', ') : 'Seed only'
          }`
        );
        generatedDescription.push(
          `Explicit linked CBGs: ${selectedCBGs.length}`
        );
        generatedDescription.push(
          `Explicit population: ${Number(
            guidedSelectionSummary.selectedPopulation || 0
          ).toLocaleString()}`
        );
        generatedDescription.push(
          `Captured external outbound flow (linked CBGs): ${(
            guidedSelectionSummary.selectedLinkedOutboundShare * 100
          ).toFixed(1)}%`
        );
        generatedDescription.push(
          `Captured total seed movement: ${(
            guidedSelectionSummary.selectedSeedMovementShare * 100
          ).toFixed(1)}%`
        );
        generatedDescription.push(
          `Unmodeled external pressure: ${(
            guidedSelectionSummary.externalRemainderShare * 100
          ).toFixed(1)}%`
        );
      }

      if (clusterAlgorithm === 'greedy_weight_seed_guard') {
        generatedDescription.push(
          `Seed guard distance (km): ${seedGuardDistanceKm}`
        );
      }
      const descriptionToSave =
        trimmedDescription || generatedDescription.join('\n');
      if (!trimmedDescription) {
        setDescription(descriptionToSave);
      }

      const guestClaimToken = user?.id ? null : createGuestZoneClaimToken();

      const finalizePayload = {
        name: cityName,
        description: descriptionToSave,
        cbg_list: selectedCBGs,
        start_date: dateOnlyToUtcIso(startDate),
        length: lengthHours,
        latitude: mapCenter?.[0] || 0,
        longitude: mapCenter?.[1] || 0,
        use_test_data: useTestData,
        ...(user?.id ? { user_id: user.id } : {}),
        ...(guestClaimToken ? { guest_claim_token: guestClaimToken } : {})
      };

      const data = await finalizeConvenienceZone(finalizePayload);
      if (!data?.id) {
        throw new Error(
          data?.message ||
            'Failed to create convenience zone. Please try again.'
        );
      }

      const zoneId: number = data.id;
      if (guestClaimToken) {
        rememberGuestZoneClaim(zoneId, guestClaimToken);
      }
      setFinalizeProgress(15);
      setFinalizeStatusMessage(
        user?.id
          ? 'Zone saved. Generating movement patterns...'
          : 'Zone generated. Generating movement patterns...'
      );

      const readyZone = await waitForZoneReady(
        zoneId,
        (percent) => {
          setFinalizeProgress(percent);
        },
        guestClaimToken
      );

      if (readyZone) {
        setSettings({
          zone: readyZone,
          hours: readyZone.length,
          sim_id: null
        });
      }

      setFinalizeProgress(100);
      setFinalizeStatusMessage('Generation complete. Opening simulator...');

      router.push('/simulator');
    } catch (err) {
      console.error('Error finalizing CZ:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create convenience zone. Please try again.'
      );
      setPhase('edit');
    }
  };

  const saveCZHtmlMap = async () => {
    if (!selectedCBGs.length) {
      setError('Please select at least one CBG');
      return;
    }

    setSavingHtmlMap(true);
    try {
      const suggestedName =
        String(cityName || location || 'cz-map').trim() || 'cz-map';
      const exportedMap = await exportCzMapHtml({
        cbg_list: selectedCBGs,
        name: suggestedName
      });

      const url = URL.createObjectURL(exportedMap.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportedMap.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to save CZ HTML map:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to export the CZ HTML map.'
      );
    } finally {
      setSavingHtmlMap(false);
    }
  };

  return {
    isPending,
    savingHtmlMap,
    finalizeProgress,
    finalizeStatusMessage,
    finalizeCZ,
    saveCZHtmlMap
  };
}
