import type { GeoJSONData } from '@/lib/cz-geo';

export type TraceCandidate = {
  cbg?: string;
  score?: number;
  rank?: number;
  selected?: boolean;
  movement_to_cluster?: number;
  movement_to_full_cluster?: number;
  movement_to_outside?: number;
  movement_contributes_after_selection?: boolean;
  seed_distance_km?: number;
  seed_movement_loss?: number;
  seed_capture_after?: number;
  czi_after?: number;
  [key: string]: unknown;
};

export type TraceStep = {
  cluster_before?: string[];
  cluster_after?: string[];
  selected_cbg?: string;
  candidates?: TraceCandidate[];
};

export type TracePayload = {
  algorithm?: string;
  algorithm_metadata?: ClusterAlgorithmMetadata | null;
  supports_stepwise?: boolean;
  steps?: TraceStep[];
  note?: string;
};

export type TraceLayerData = {
  clusterSet: Set<string>;
  candidateByCbg: Map<string, TraceCandidate>;
  selectedCbg?: string;
  minScore: number;
  maxScore: number;
};

export type PoiAnalysis = {
  placekey?: string;
  location_name?: string;
  rank?: number;
  cluster_flow?: number;
  flow_share?: number;
};

export type ZoneMetrics = {
  movement_inside?: number;
  movement_boundary?: number;
  czi?: number;
  cbg_count?: number;
};

export type ResolvedSeedLookup = {
  query: string;
  cbg: string;
  cityName: string;
  seedName: string;
  seedCbgs: string[];
  seedZip?: string;
};

export type LookupLocationResult = {
  cbg: string;
  city: string;
  state: string;
  zip?: string;
  seed_type: 'zip' | 'cbg';
  seed_name: string;
  seed_cbgs: string[];
};

export type HierarchicalSatellite = {
  unit_id?: string;
  label?: string;
  population?: number;
  coupling?: number;
  shared_flow?: number;
  cbg_count?: number;
};

export type HierarchicalAlgorithmMetadata = {
  seed_cbgs?: string[];
  seed_zip_codes?: string[];
  core_cluster?: string[];
  core_population?: number;
  core_containment?: {
    origin?: number;
    destination?: number;
    zone?: number;
  };
  final_containment?: {
    origin?: number;
    destination?: number;
    zone?: number;
  };
  selected_satellites?: HierarchicalSatellite[];
  external_pressure_share?: number;
  population_target_met?: boolean;
};

export type MobilityPruneAlgorithmMetadata = {
  seed_cbgs?: string[];
  missing_seed_cbgs?: string[];
  seed_population?: number;
  bounded_envelope?: boolean;
  envelope_population_target?: number;
  envelope_population_multiplier?: number;
  envelope_population_floor?: number;
  envelope_max_cbgs?: number;
  min_seed_capture?: number;
  envelope_growth_iterations?: number;
  envelope_limited_by_cbg_cap?: boolean;
  stopped_by_seed_capture_floor?: boolean;
  initial_cbg_count?: number;
  initial_population?: number;
  initial_movement_inside?: number;
  initial_movement_boundary?: number;
  initial_czi?: number;
  seed_movement_total?: number;
  initial_seed_movement_captured?: number;
  initial_seed_capture_share?: number;
  final_seed_movement_captured?: number;
  final_seed_capture_share?: number;
  final_movement_inside?: number;
  final_movement_boundary?: number;
  final_czi?: number;
  population_target_met?: boolean;
  population_reduced?: number;
  removed_cbg_count?: number;
};

export type ClusterAlgorithmMetadata = HierarchicalAlgorithmMetadata &
  MobilityPruneAlgorithmMetadata;

export type GuidedLinkedCbgDetail = {
  cbg?: string;
  population?: number;
  seed_outbound_flow?: number;
  seed_inbound_flow?: number;
  seed_bidirectional_flow?: number;
  distance_km?: number;
  gateway_score?: number;
};

export type GuidedDestinationCandidate = {
  unit_id: string;
  label: string;
  unit_type?: string;
  cbgs: string[];
  gateway_cbgs?: GuidedLinkedCbgDetail[];
  cbg_count?: number;
  city_cbg_count?: number;
  zip_codes?: string[];
  zip_count?: number;
  population?: number;
  city_population?: number;
  outbound_flow?: number;
  inbound_flow?: number;
  bidirectional_flow?: number;
  coupling?: number;
  share_of_seed_external_bidirectional?: number;
  share_of_seed_total_movement?: number;
  share_of_seed_external_outbound?: number;
  cumulative_external_bidirectional_share?: number;
  cumulative_external_outbound_share?: number;
  cumulative_seed_total_movement_share?: number;
  captured_bidirectional_flow?: number;
  captured_bidirectional_flow_share?: number;
  distance_km?: number;
  recommended?: boolean;
};

export type GuidedSecondOrderMetadata = {
  seed_cbg: string;
  seed_cbgs: string[];
  seed_zip_codes?: string[];
  seed_city_labels?: string[];
  missing_seed_cbgs?: string[];
  seed_population?: number;
  total_seed_movement?: number;
  total_seed_internal_movement?: number;
  total_seed_external_outbound_flow?: number;
  total_seed_external_inbound_flow?: number;
  total_seed_external_bidirectional_flow?: number;
  unit_type?: string;
  approximation_note?: string;
  destination_count?: number;
  destinations: GuidedDestinationCandidate[];
  recommended_unit_ids?: string[];
  recommended_captured_external_bidirectional_share?: number;
  recommended_captured_external_outbound_share?: number;
  recommended_captured_seed_total_movement_share?: number;
  recommended_explicit_population?: number;
  recommended_explicit_population_cap?: number;
};

export type GuidedSelectionSummary = {
  selectedLinkedOutboundFlow: number;
  selectedLinkedOutboundShare: number;
  selectedExternalBidirectionalShare: number;
  selectedSeedMovementShare: number;
  externalRemainderShare: number;
  selectedPopulation: number;
};

export type GuidedSelectionStyle = {
  fillColor: string;
  lineColor: string;
};

export type SeedEditAction = 'observe' | 'add' | 'remove';

export type ClusteringPreviewResponse = {
  cluster?: string[];
  clustering_id?: number | string;
  seed_cbg?: string;
  center?: [number, number] | null;
  size?: number | string;
  use_test_data?: boolean;
  algorithm_metadata?: ClusterAlgorithmMetadata | null;
  trace?: TracePayload | null;
  algorithm?: string;
  clustering_params?: {
    seed_guard_distance_km?: number | string;
    min_seed_capture?: number | string;
  } | null;
  geojson?: GeoJSONData | null;
  trace_geojson?: GeoJSONData | null;
};
