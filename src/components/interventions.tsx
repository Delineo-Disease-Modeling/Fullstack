'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import useSimSettings, {
  type Interventions as InterventionSettings
} from '@/stores/simsettings';
import { SimParameter } from './settings-components';

type DisplayValues = Omit<InterventionSettings, 'time'>;

const ANIM_KEYS: (keyof DisplayValues)[] = [
  'mask',
  'vaccine',
  'capacity',
  'lockdown',
  'selfiso'
];

const DURATION = 280;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export default function Interventions({ time }: { time: number }) {
  const allInterventions = useSimSettings((state) => state.interventions);
  const setInterventions = useSimSettings((state) => state.setInterventions);

  const interventions = allInterventions.find((i) => i.time === time);

  const [animValues, setAnimValues] = useState<DisplayValues | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevTimeRef = useRef(time);
  const allInterventionsRef = useRef(allInterventions);
  allInterventionsRef.current = allInterventions;

  useLayoutEffect(() => {
    const prevTime = prevTimeRef.current;
    if (prevTime === time) return;
    prevTimeRef.current = time;

    const from = allInterventionsRef.current.find((i) => i.time === prevTime);
    const to = allInterventionsRef.current.find((i) => i.time === time);

    if (!from || !to) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    // Pin display to FROM values immediately — this re-renders synchronously
    // before the browser paints, preventing any flash of the destination values.
    setAnimValues(
      Object.fromEntries(ANIM_KEYS.map((k) => [k, from[k]])) as DisplayValues
    );

    const startTs = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / DURATION);
      const eased = easeOutCubic(t);

      const animated = Object.fromEntries(
        ANIM_KEYS.map((k) => [k, from[k] + (to[k] - from[k]) * eased])
      ) as DisplayValues;

      if (t < 1) {
        setAnimValues(animated);
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimValues(null);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [time]);

  if (!interventions) return null;

  const display: DisplayValues = animValues ?? interventions;

  return (
    <div className="iv_sliders_grid">
      <SimParameter
        label={'Percent Masking'}
        value={display.mask}
        callback={(mask) => setInterventions(time, { mask })}
        info={'Proportion of people who wear masks, reducing the probability of disease transmission between individuals.'}
      />
      <SimParameter
        label={'Percent Vaccinated'}
        value={display.vaccine}
        callback={(vaccine) => setInterventions(time, { vaccine })}
        info={'Proportion of the population that is vaccinated, reducing individual susceptibility to infection.'}
      />
      <SimParameter
        label={'Maximum Facility Capacity'}
        value={display.capacity}
        callback={(capacity) => setInterventions(time, { capacity })}
        info={'Scales the maximum occupancy of every facility. At 50%, a venue that holds 100 people caps at 50, and anyone over the limit is sent home.'}
        disabled
      />
      <SimParameter
        label={'Lockdown Probability'}
        value={display.lockdown}
        callback={(lockdown) => setInterventions(time, { lockdown })}
        info={'Chance that any person stays home instead of travelling to a facility during a movement event. Applies regardless of health status.'}
      />
      <SimParameter
        label={'Self-Isolation Percent'}
        value={display.selfiso}
        callback={(selfiso) => setInterventions(time, { selfiso })}
        info={'Chance that a symptomatic (visibly ill) person stays home instead of going to a facility, modelling voluntary quarantine behaviour.'}
      />
    </div>
  );
}
