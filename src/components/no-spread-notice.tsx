import {
  FEW_INFECTIONS_PERCENT,
  hasFewNewInfections,
  hasNoNewInfections
} from '@/lib/no-spread';
import { totalNewInfections } from '@/lib/seed-check';
import type { RunIncidence } from '@/stores/mapdata';

// Said once above the hotspot tables, so an empty ranking, heatmap and place
// table are not mistaken for a broken page, and so a ranking built on a handful
// of cases is not read as a pattern. It only reports what the run's own numbers
// show and names the two settings that change how far a disease spreads; it
// does not claim why this run did not spread.
export default function NoSpreadNotice({
  incidence,
  residents,
  seedCheckBelow
}: {
  incidence: RunIncidence | null;
  // People who live in the zone, null when the homes do not say.
  residents: number | null;
  // Whether "Check against other random seeds" is on the page, below this note.
  seedCheckBelow: boolean;
}) {
  if (hasFewNewInfections(incidence, residents)) {
    const total = totalNewInfections(incidence) ?? 0;
    return (
      <div className="hotspot_notice">
        <strong>
          Only {total.toLocaleString('en-US')}{' '}
          {total === 1 ? 'person was' : 'people were'} newly infected in this
          run, fewer than {FEW_INFECTIONS_PERCENT}% of the residents listed for
          this zone.
        </strong>{' '}
        The infection rankings below therefore rest on very few cases. One run
        is one random draw, so another run can look very different
        {seedCheckBelow
          ? '; the check against other random seeds below shows how far.'
          : '; more initially infected people or a longer duration also make spread more likely.'}
      </div>
    );
  }
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
