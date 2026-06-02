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
      setError(e instanceof Error ? e.message : 'Failed to load person path.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDayExpansion = (dayIndex: number) => {
    setExpandedDays((prev) => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  return (
    <section className="person_path_panel">
      <div className="person_path_header">
        <div>
          <span className="sim_run_section_kicker">Movement</span>
          <h2 className="sim_run_section_title">Person path explorer</h2>
        </div>
      </div>

      <div className="person_path_controls">
        <input
          className="person_path_input"
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
          className="person_path_button"
          onClick={() => void handleLoad()}
          disabled={isLoading || !simId}
        >
          {isLoading ? 'Loading...' : 'Load Path'}
        </Button>
        {pathData?.days?.length ? (
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="person_path_select"
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

      {error ? <div className="person_path_error">{error}</div> : null}

      {pathData ? (
        <div className="person_path_results">
          <div className="person_path_summary">
            <span>Person #{pathData.person_id}</span>
            {pathData.person ? (
              <>
                {' '}
                | Age {pathData.person.age ?? '-'} | {pathData.person.sex} |
                Home #{pathData.person.home ?? '-'}
              </>
            ) : null}{' '}
            | {pathData.total_hours}h tracked | {pathData.days.length} day(s)
          </div>

          {filteredDays.length === 0 ? (
            <div className="person_path_empty">
              No movement segments found for this person.
            </div>
          ) : (
            <div className="person_path_days">
              {filteredDays.map((day) => {
                const isExpanded = Boolean(expandedDays[day.day_index]);
                const visibleStops = isExpanded
                  ? day.stops
                  : day.stops.slice(0, MAX_VISIBLE_STOPS);

                return (
                  <div key={day.day_index} className="person_path_day">
                    <div className="person_path_day_header">
                      <div>
                        Day {day.day_index} - {formatDayLabel(day.day_date_iso)}
                      </div>
                      <div>{day.total_hours}h tracked</div>
                    </div>

                    <div className="person_path_stop_list">
                      {visibleStops.map((stop) => (
                        <div
                          key={`${day.day_index}-${stop.location_type}-${stop.location_id}-${stop.start_minute}-${stop.end_time_iso}`}
                          className="person_path_stop"
                        >
                          <span>{formatDateTime(stop.start_time_iso)}</span>
                          <span>{formatDateTime(stop.end_time_iso)}</span>
                          <span>{stop.location_label}</span>
                          <span className="person_path_stop_duration">
                            {formatDuration(stop.duration_minutes)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {day.stops.length > MAX_VISIBLE_STOPS ? (
                      <button
                        type="button"
                        className="person_path_show_more"
                        onClick={() => toggleDayExpansion(day.day_index)}
                      >
                        {isExpanded
                          ? 'Show fewer stops'
                          : `Show all ${day.stops.length} stops`}
                      </button>
                    ) : null}

                    {day.totals?.length ? (
                      <div className="person_path_totals">
                        <div className="person_path_totals_title">
                          Top locations by time
                        </div>
                        <div className="person_path_totals_list">
                          {day.totals.slice(0, 5).map((total) => (
                            <div
                              key={`${day.day_index}-${total.location_type}-${total.location_id}`}
                              className="person_path_total_row"
                            >
                              <span>{total.location_label}</span>
                              <span>
                                {formatDuration(total.duration_minutes)} (
                                {total.visits} visit
                                {total.visits === 1 ? '' : 's'})
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
    </section>
  );
}
