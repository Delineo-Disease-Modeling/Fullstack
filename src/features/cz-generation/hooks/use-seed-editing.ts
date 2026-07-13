import { useCallback, useMemo, useState } from 'react';
import { fetchCbgGeoJson } from '@/features/cz-generation/api';
import {
  CBG_GEOJSON_REQUEST_CHUNK_SIZE,
  INITIAL_SEED_EDIT_NEIGHBOR_RINGS
} from '@/features/cz-generation/constants';
import {
  dedupeCbgList,
  filterGeoJsonByCbgs,
  getCbgIdsFromGeoJson,
  sameStringArray
} from '@/features/cz-generation/helpers';
import type {
  ResolvedSeedLookup,
  SeedEditAction
} from '@/features/cz-generation/types';
import {
  type GeoJSONData,
  mergeGeoJsonFeatures,
  normalizeCbgId
} from '@/lib/cz-geo';

type ApplyResolvedSeedPreviewArgs = {
  query: string;
  coreCbg: string;
  seedName: string;
  seedCbgs: string[];
  seedGeoJson: GeoJSONData;
  cityName: string;
  seedZip?: string;
};

export function useSeedEditing() {
  const [setupSeedCbg, setSetupSeedCbg] = useState('');
  const [setupSeedLabel, setSetupSeedLabel] = useState('');
  const [setupSeedCount, setSetupSeedCount] = useState(0);
  const [setupSeedCbgs, setSetupSeedCbgs] = useState<string[]>([]);
  const [resolvedSetupSeedCbgs, setResolvedSetupSeedCbgs] = useState<string[]>(
    []
  );
  const [setupSeedGeoJSON, setSetupSeedGeoJSON] =
    useState<GeoJSONData | null>(null);
  const [seedEditGeoJSON, setSeedEditGeoJSON] =
    useState<GeoJSONData | null>(null);
  const [seedEditMode, setSeedEditMode] = useState(false);
  const [seedEditAction, setSeedEditAction] =
    useState<SeedEditAction>('observe');
  const [seedEditLoading, setSeedEditLoading] = useState(false);
  const [seedEditError, setSeedEditError] = useState('');
  const [seedEditStartCbgs, setSeedEditStartCbgs] = useState<string[]>([]);
  const [seedEditNeighborRings, setSeedEditNeighborRings] = useState(0);
  const [setupResolvedCityName, setSetupResolvedCityName] = useState('');
  const [resolvedSeedLookup, setResolvedSeedLookup] =
    useState<ResolvedSeedLookup | null>(null);
  const [seedResolveError, setSeedResolveError] = useState('');

  const seedAdjustmentSummary = useMemo(() => {
    const resolvedSet = new Set(resolvedSetupSeedCbgs);
    const currentSet = new Set(setupSeedCbgs);
    const addedCount = setupSeedCbgs.filter(
      (cbg) => !resolvedSet.has(cbg)
    ).length;
    const removedCount = resolvedSetupSeedCbgs.filter(
      (cbg) => !currentSet.has(cbg)
    ).length;

    return {
      addedCount,
      removedCount,
      hasChanges: addedCount > 0 || removedCount > 0
    };
  }, [resolvedSetupSeedCbgs, setupSeedCbgs]);

  const activeSetupSeedGeoJSON = seedEditMode
    ? seedEditGeoJSON || setupSeedGeoJSON
    : setupSeedGeoJSON;

  const resetSeedPreview = useCallback(() => {
    setSetupSeedCbg('');
    setSetupSeedLabel('');
    setSetupSeedCount(0);
    setSetupSeedCbgs([]);
    setResolvedSetupSeedCbgs([]);
    setSetupSeedGeoJSON(null);
    setSeedEditGeoJSON(null);
    setSeedEditMode(false);
    setSeedEditAction('observe');
    setSeedEditLoading(false);
    setSeedEditError('');
    setSeedEditStartCbgs([]);
    setSeedEditNeighborRings(0);
    setSetupResolvedCityName('');
    setResolvedSeedLookup(null);
    setSeedResolveError('');
  }, []);

  const loadSeedGeoJson = useCallback(
    async (seedCbgs: string[], includeNeighbors: boolean) => {
      const normalizedSeedCbgs = dedupeCbgList(seedCbgs);
      if (!normalizedSeedCbgs.length) {
        throw new Error('Select at least one seed CBG.');
      }

      let mergedGeoJson: GeoJSONData | null = null;
      for (
        let index = 0;
        index < normalizedSeedCbgs.length;
        index += CBG_GEOJSON_REQUEST_CHUNK_SIZE
      ) {
        const chunk = normalizedSeedCbgs.slice(
          index,
          index + CBG_GEOJSON_REQUEST_CHUNK_SIZE
        );
        const seedGeoJson = await fetchCbgGeoJson(chunk, includeNeighbors);
        if (!seedGeoJson?.features?.length) {
          throw new Error(
            seedGeoJson?.message ||
              'Resolved the seed CBGs, but could not load their map boundary.'
          );
        }

        mergedGeoJson = mergeGeoJsonFeatures(
          mergedGeoJson,
          seedGeoJson as GeoJSONData
        );
      }

      if (!mergedGeoJson?.features?.length) {
        throw new Error(
          'Resolved the seed CBGs, but could not load their map boundary.'
        );
      }

      return mergedGeoJson;
    },
    []
  );

  const loadSeedEditGeoJson = useCallback(
    async (seedCbgs: string[], neighborRings: number) => {
      const rings = Math.max(1, Math.floor(neighborRings));
      let queryCbgs = dedupeCbgList(seedCbgs);
      let mergedGeoJson: GeoJSONData | null = null;

      for (let ringIndex = 0; ringIndex < rings; ringIndex += 1) {
        const ringGeoJson = await loadSeedGeoJson(queryCbgs, true);
        const nextMergedGeoJson = mergeGeoJsonFeatures(
          mergedGeoJson,
          ringGeoJson
        );
        const nextQueryCbgs = getCbgIdsFromGeoJson(nextMergedGeoJson);

        mergedGeoJson = nextMergedGeoJson;
        if (sameStringArray(nextQueryCbgs, queryCbgs)) {
          break;
        }
        queryCbgs = nextQueryCbgs;
      }

      return mergeGeoJsonFeatures(setupSeedGeoJSON, mergedGeoJson);
    },
    [loadSeedGeoJson, setupSeedGeoJSON]
  );

  const refreshSeedEditGeoJson = useCallback(
    async (seedCbgs: string[], neighborRings: number) => {
      const editGeoJson = await loadSeedEditGeoJson(seedCbgs, neighborRings);
      setSeedEditGeoJSON(editGeoJson);
      setSeedEditNeighborRings(
        Math.max(
          1,
          Math.floor(neighborRings || INITIAL_SEED_EDIT_NEIGHBOR_RINGS)
        )
      );
    },
    [loadSeedEditGeoJson]
  );

  const expandSeedEditGeoJsonForAddedCbgs = useCallback(
    async (cbgIds: string[]) => {
      const normalizedCbgs = dedupeCbgList(cbgIds);
      if (!normalizedCbgs.length) {
        return;
      }

      try {
        const nearbyGeoJson = await loadSeedGeoJson(normalizedCbgs, true);
        setSeedEditGeoJSON((currentGeoJson) =>
          mergeGeoJsonFeatures(
            currentGeoJson || setupSeedGeoJSON,
            nearbyGeoJson
          )
        );
      } catch (err) {
        setSeedEditError(
          err instanceof Error
            ? err.message
            : 'Seed updated, but nearby CBGs could not be loaded.'
        );
      }
    },
    [loadSeedGeoJson, setupSeedGeoJSON]
  );

  const commitSetupSeedCbgs = useCallback(
    (nextSeedCbgs: string[]) => {
      const normalizedSeedCbgs = dedupeCbgList(nextSeedCbgs);
      if (!normalizedSeedCbgs.length) {
        setSeedEditError('Keep at least one CBG in the seed area.');
        return null;
      }

      const currentAnchor = normalizeCbgId(setupSeedCbg);
      const nextAnchor = normalizedSeedCbgs.includes(currentAnchor)
        ? currentAnchor
        : normalizedSeedCbgs[0];
      const sourceGeoJson = seedEditGeoJSON || setupSeedGeoJSON;
      const selectedGeoJson = filterGeoJsonByCbgs(
        sourceGeoJson,
        normalizedSeedCbgs
      );

      setSetupSeedCbgs(normalizedSeedCbgs);
      setSetupSeedCount(normalizedSeedCbgs.length);
      setSetupSeedCbg(nextAnchor);
      setSeedEditError('');
      if (selectedGeoJson) {
        setSetupSeedGeoJSON(selectedGeoJson);
      }
      setResolvedSeedLookup((prev) =>
        prev
          ? {
              ...prev,
              cbg: nextAnchor,
              seedCbgs: normalizedSeedCbgs
            }
          : prev
      );

      return normalizedSeedCbgs;
    },
    [seedEditGeoJSON, setupSeedCbg, setupSeedGeoJSON]
  );

  const beginSeedEdit = useCallback(async () => {
    if (!setupSeedCbgs.length) {
      return;
    }

    setSeedEditMode(true);
    setSeedEditAction('observe');
    setSeedEditStartCbgs(setupSeedCbgs);
    setSeedEditError('');
    setSeedEditLoading(true);
    try {
      await refreshSeedEditGeoJson(
        setupSeedCbgs,
        INITIAL_SEED_EDIT_NEIGHBOR_RINGS
      );
    } catch (err) {
      setSeedEditError(
        err instanceof Error
          ? err.message
          : 'Could not load nearby CBGs for seed adjustment.'
      );
    } finally {
      setSeedEditLoading(false);
    }
  }, [refreshSeedEditGeoJson, setupSeedCbgs]);

  const updateEditableSeedSelection = useCallback(
    async (cbgIds: string[]) => {
      const normalizedClickedCbgs = dedupeCbgList(cbgIds);
      if (!normalizedClickedCbgs.length) {
        return;
      }

      const clickedSet = new Set(normalizedClickedCbgs);
      const currentSet = new Set(setupSeedCbgs);
      if (seedEditAction === 'observe') {
        return;
      }

      const addedCbgs =
        seedEditAction === 'add'
          ? normalizedClickedCbgs.filter((cbg) => !currentSet.has(cbg))
          : [];

      const nextSeedCbgs =
        seedEditAction === 'add'
          ? dedupeCbgList([...setupSeedCbgs, ...normalizedClickedCbgs])
          : setupSeedCbgs.filter((cbg) => !clickedSet.has(cbg));

      if (seedEditAction === 'add' && nextSeedCbgs.length === currentSet.size) {
        return;
      }

      if (seedEditAction === 'remove' && nextSeedCbgs.length === 0) {
        setSeedEditError('Keep at least one CBG in the seed area.');
        return;
      }

      const committedSeedCbgs = commitSetupSeedCbgs(nextSeedCbgs);
      if (
        !committedSeedCbgs ||
        sameStringArray(committedSeedCbgs, setupSeedCbgs)
      ) {
        return;
      }

      if (addedCbgs.length) {
        void expandSeedEditGeoJsonForAddedCbgs(addedCbgs);
      }
    },
    [
      commitSetupSeedCbgs,
      expandSeedEditGeoJsonForAddedCbgs,
      seedEditAction,
      setupSeedCbgs
    ]
  );

  const finishSeedEdit = useCallback(() => {
    setSeedEditMode(false);
    setSeedEditGeoJSON(null);
    setSeedEditStartCbgs([]);
    setSeedEditError('');
  }, []);

  const cancelSeedEdit = useCallback(() => {
    const committedSeedCbgs = commitSetupSeedCbgs(seedEditStartCbgs);
    if (committedSeedCbgs) {
      setSeedEditMode(false);
      setSeedEditGeoJSON(null);
      setSeedEditStartCbgs([]);
      setSeedEditError('');
    }
  }, [commitSetupSeedCbgs, seedEditStartCbgs]);

  const resetAdjustedSeed = useCallback(async () => {
    const committedSeedCbgs = commitSetupSeedCbgs(resolvedSetupSeedCbgs);
    if (!committedSeedCbgs) {
      return;
    }

    setSeedEditLoading(true);
    try {
      if (seedEditMode) {
        await refreshSeedEditGeoJson(
          committedSeedCbgs,
          seedEditNeighborRings || INITIAL_SEED_EDIT_NEIGHBOR_RINGS
        );
      } else {
        const seedGeoJson = await loadSeedGeoJson(committedSeedCbgs, false);
        setSetupSeedGeoJSON(seedGeoJson);
      }
      setSeedEditError('');
    } catch (err) {
      setSeedEditError(
        err instanceof Error
          ? err.message
          : 'Could not reset the seed area boundary.'
      );
    } finally {
      setSeedEditLoading(false);
    }
  }, [
    commitSetupSeedCbgs,
    loadSeedGeoJson,
    refreshSeedEditGeoJson,
    resolvedSetupSeedCbgs,
    seedEditNeighborRings,
    seedEditMode
  ]);

  const showMoreSeedEditNeighbors = useCallback(async () => {
    if (!seedEditMode || !setupSeedCbgs.length) {
      return;
    }

    const nextNeighborRings = Math.max(
      seedEditNeighborRings + 1,
      INITIAL_SEED_EDIT_NEIGHBOR_RINGS + 1
    );

    setSeedEditLoading(true);
    setSeedEditError('');
    try {
      await refreshSeedEditGeoJson(setupSeedCbgs, nextNeighborRings);
    } catch (err) {
      setSeedEditError(
        err instanceof Error
          ? err.message
          : 'Could not load a wider nearby area.'
      );
    } finally {
      setSeedEditLoading(false);
    }
  }, [
    refreshSeedEditGeoJson,
    seedEditMode,
    seedEditNeighborRings,
    setupSeedCbgs
  ]);

  const applyResolvedSeedPreview = useCallback(
    ({
      query,
      coreCbg,
      seedName,
      seedCbgs,
      seedGeoJson,
      cityName,
      seedZip
    }: ApplyResolvedSeedPreviewArgs) => {
      setSetupSeedCbg(coreCbg);
      setSetupSeedLabel(seedName);
      setSetupSeedCount(seedCbgs.length);
      setSetupSeedCbgs(seedCbgs);
      setResolvedSetupSeedCbgs(seedCbgs);
      setSetupSeedGeoJSON(seedGeoJson);
      setSeedEditGeoJSON(null);
      setSeedEditMode(false);
      setSeedEditAction('observe');
      setSeedEditError('');
      setSeedEditStartCbgs([]);
      setSeedEditNeighborRings(0);
      setSetupResolvedCityName(cityName);
      setResolvedSeedLookup({
        query,
        cbg: coreCbg,
        cityName,
        seedName,
        seedCbgs,
        seedZip
      });
    },
    []
  );

  const clearSeedPreviewWithError = useCallback((message: string) => {
    setSetupSeedCbg('');
    setSetupSeedLabel('');
    setSetupSeedCount(0);
    setSetupSeedCbgs([]);
    setResolvedSetupSeedCbgs([]);
    setSetupSeedGeoJSON(null);
    setSeedEditGeoJSON(null);
    setSeedEditMode(false);
    setSeedEditAction('observe');
    setSeedEditError('');
    setSeedEditStartCbgs([]);
    setSeedEditNeighborRings(0);
    setSetupResolvedCityName('');
    setResolvedSeedLookup(null);
    setSeedResolveError(message);
  }, []);

  const seedStateCbg =
    setupSeedCbg || setupSeedCbgs[0] || resolvedSeedLookup?.cbg || '';

  return {
    setupSeedCbg,
    setupSeedLabel,
    setupSeedCount,
    setupSeedCbgs,
    resolvedSetupSeedCbgs,
    setupSeedGeoJSON,
    seedEditGeoJSON,
    seedEditMode,
    seedEditAction,
    seedEditLoading,
    seedEditError,
    seedEditNeighborRings,
    setupResolvedCityName,
    resolvedSeedLookup,
    seedResolveError,
    seedAdjustmentSummary,
    activeSetupSeedGeoJSON,
    seedStateCbg,
    setSetupSeedGeoJSON,
    setSeedEditMode,
    setSeedEditAction,
    setResolvedSeedLookup,
    setSeedResolveError,
    resetSeedPreview,
    loadSeedGeoJson,
    beginSeedEdit,
    updateEditableSeedSelection,
    finishSeedEdit,
    cancelSeedEdit,
    resetAdjustedSeed,
    showMoreSeedEditNeighbors,
    applyResolvedSeedPreview,
    clearSeedPreviewWithError
  };
}
