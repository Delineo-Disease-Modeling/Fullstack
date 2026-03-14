'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/button';

const MAX_VISIBLE_STOPS = 40;

type PersonPathTotals = {
  location_type: string;
  location_id: string;
  location_label: string;
  duration_minutes: number;
  duration_hours: number;
  visits: number;
};

type PersonPathStop = {
  location_type: string;
  location_id: string;
  location_label: string;
  start_minute: number;
  end_minute: number;
  duration_minutes: number;
  start_time_iso: string;
  end_time_iso: string;
};

type PersonPathDay = {
  day_index: number;
  day_date_iso: string;
  total_minutes: number;
  total_hours: number;
  stops: PersonPathStop[];
  totals: PersonPathTotals[];
};

type PersonPathData = {
  person_id: number;
  person: {
    id: number;
    age: number | null;
    sex: string;
    home: string | null;
  } | null;
  step_minutes: number;
  total_minutes: number;
  total_hours: number;
  days: PersonPathDay[];
};

interface PersonPathPanelProps {
  simId: number | null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function formatDayLabel(dayIso: string) {
  return new Date(`${dayIso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)}h`;
  }
  return `${minutes}m`;
}

export default function PersonPathPanel({ simId }: PersonPathPanelProps) {
  const [personIdInput, setPersonIdInput] = useState('');
  const [selectedDay, setSelectedDay] = useState('all');
  const [pathData, setPathData] = useState<PersonPathData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});

  const filteredDays = useMemo(() => {
    if (!pathData?.days) {
      return [];
    }
    if (selectedDay === 'all') {
      return pathData.days;
    }
    return pathData.days.filter(
      (day) => String(day.day_index) === String(selectedDay)
    );
  }, [pathData, selectedDay]);

  const handleLoad = async () => {
    const personId = Number(personIdInput);
    if (!Number.isInteger(personId) || personId < 0) {
      setError('Enter a valid non-negative person ID.');
      return;
    }
    if (!simId) {
      setError('Run data is not available yet.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(
        `/api/simdata/${simId}/person-path`,
        window.location.origin
      );
      url.searchParams.set('person_id', String(personId));
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.message || `Failed to load person path (${res.status})`
        );
      }

      setPathData(json.data as PersonPathData);
      setSelectedDay('all');
      setExpandedDays({});
    } catch (e) {
      console.error(e);
      setPathData(null);
      setError(
        e instanceof Error ? e.message : 'Failed to load person path.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDayExpansion = (dayIndex: number) => {
    setExpandedDays((prev) => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  return (
    <div className="w-full rounded-md border-2 border-(--color-primary-blue) bg-(--color-bg-ivory) px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Person Movement Explorer</h3>
        <span className="text-xs text-gray-600">
          Load a person timeline by simulation person ID.
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className="w-44 rounded px-2 py-1 text-sm bg-white outline-solid outline-2 outline-(--color-primary-blue)"
          type="number"
          min={0}
          step={1}
          value={personIdInput}
          onChange={(e) => setPersonIdInput(e.target.value)}
          placeholder="Enter person ID"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleLoad();
            }
          }}
        />
        <Button
          variant="primary"
          onClick={() => void handleLoad()}
          disabled={isLoading || !simId}
        >
          {isLoading ? 'Loading...' : 'Load Path'}
        </Button>
        {pathData?.days?.length ? (
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="rounded px-2 py-1 text-xs bg-white outline-solid outline-2 outline-(--color-primary-blue)"
          >
            <option value="all">All Days</option>
            {pathData.days.map((day) => (
              <option key={day.day_index} value={day.day_index}>
                Day {day.day_index} ({formatDayLabel(day.day_date_iso)})
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}

      {pathData ? (
        <div className="mt-3 max-h-96 space-y-3 overflow-y-scroll rounded-md border-2 border-(--color-primary-blue) p-3 pr-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:mr-1 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          <div className="text-xs text-gray-700">
            <span className="font-semibold">Person #{pathData.person_id}</span>
            {pathData.person ? (
              <>
                {' '}
                | Age {pathData.person.age ?? '-'} | {pathData.person.sex} | Home #
                {pathData.person.home ?? '-'}
              </>
            ) : null}
            {' '}
            | {pathData.total_hours}h tracked | {pathData.days.length} day(s)
          </div>

          {filteredDays.length === 0 ? (
            <div className="text-xs text-gray-600">
              No movement segments found for this person.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDays.map((day) => {
                const isExpanded = Boolean(expandedDays[day.day_index]);
                const visibleStops = isExpanded
                  ? day.stops
                  : day.stops.slice(0, MAX_VISIBLE_STOPS);

                return (
                  <div
                    key={day.day_index}
                    className="rounded border border-[#d7e8f1] bg-white p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <div className="font-semibold">
                        Day {day.day_index} - {formatDayLabel(day.day_date_iso)}
                      </div>
                      <div className="text-gray-600">{day.total_hours}h tracked</div>
                    </div>

                    <div className="mt-2 space-y-1 text-xs">
                      {visibleStops.map((stop, index) => (
                        <div
                          key={`${day.day_index}-${index}-${stop.start_minute}`}
                          className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 rounded px-2 py-1 odd:bg-[#f7fbfe]"
                        >
                          <span>{formatDateTime(stop.start_time_iso)}</span>
                          <span>{formatDateTime(stop.end_time_iso)}</span>
                          <span>{stop.location_label}</span>
                          <span className="font-semibold">
                            {formatDuration(stop.duration_minutes)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {day.stops.length > MAX_VISIBLE_STOPS ? (
                      <button
                        type="button"
                        className="mt-2 text-xs text-[#2a6f92] underline"
                        onClick={() => toggleDayExpansion(day.day_index)}
                      >
                        {isExpanded
                          ? 'Show fewer stops'
                          : `Show all ${day.stops.length} stops`}
                      </button>
                    ) : null}

                    {day.totals?.length ? (
                      <div className="mt-2 border-t border-[#e6eef3] pt-2">
                        <div className="mb-1 text-xs font-semibold">
                          Top locations by time
                        </div>
                        <div className="grid gap-1 text-xs">
                          {day.totals.slice(0, 5).map((total) => (
                            <div
                              key={`${day.day_index}-${total.location_type}-${total.location_id}`}
                              className="flex justify-between gap-2"
                            >
                              <span>{total.location_label}</span>
                              <span>
                                {formatDuration(total.duration_minutes)} (
                                {total.visits} visit{total.visits === 1 ? '' : 's'})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
