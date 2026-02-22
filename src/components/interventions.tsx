'use client';

import useSimSettings from '@/stores/simsettings';
import { SimParameter } from './settings-components';

export default function Interventions({ time }: { time: number }) {
  const allInterventions = useSimSettings((state) => state.interventions);
  const setInterventions = useSimSettings((state) => state.setInterventions);

  const interventions = allInterventions.find((i) => i.time === time);

  if (!interventions) return null;

  return (
    <div className="flex flex-wrap max-w-[90vw] justify-center gap-8">
      <SimParameter
        label={'Percent Masking'}
        value={interventions.mask}
        callback={(mask) => setInterventions(time, { mask })}
      />
      <SimParameter
        label={'Percent Vaccinated'}
        value={interventions.vaccine}
        callback={(vaccine) => setInterventions(time, { vaccine })}
      />
      <SimParameter
        label={'Maximum Facility Capacity'}
        value={interventions.capacity}
        callback={(capacity) => setInterventions(time, { capacity })}
      />
      <SimParameter
        label={'Lockdown Probability'}
        value={interventions.lockdown}
        callback={(lockdown) => setInterventions(time, { lockdown })}
      />
      <SimParameter
        label={'Self-Isolation Percent'}
        value={interventions.selfiso}
        callback={(selfiso) => setInterventions(time, { selfiso })}
      />
    </div>
  );
}
