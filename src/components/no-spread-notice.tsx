import { hasNoNewInfections } from '@/lib/no-spread';
import type { RunIncidence } from '@/stores/mapdata';

// Said once above the hotspot tables, so an empty ranking, heatmap and place
// table are not mistaken for a broken page. It only reports what the run's own
// numbers show and names the two settings that change how far a disease
// spreads; it does not claim why this run did not spread.
export default function NoSpreadNotice({
  incidence
}: {
  incidence: RunIncidence | null;
}) {
  if (!hasNoNewInfections(incidence)) {
    return null;
  }
  return (
    <div className="hotspot_notice">
      <strong>Nobody was newly infected in this run.</strong> The infection
      rankings below are therefore empty. One run is one random draw, so another
      run can look very different; more initially infected people or a longer
      duration also make spread more likely.
    </div>
  );
}
