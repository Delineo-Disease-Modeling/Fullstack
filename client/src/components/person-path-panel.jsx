import { useMemo, useState } from 'react';
import { DB_URL } from '../env';

const DAY_MINUTES = 24 * 60;
const MAX_VISIBLE_STOPS = 40;

function includesPersonId(values, personId) {
  if (!Array.isArray(values)) return false;
  return values.some((value) => String(value) === personId);
}

function inferStepMinutes(minutes) {
  if (minutes.length < 2) return 60;
  const diffs = [];
  for (let i = 1; i < minutes.length; i++) {
    const diff = minutes[i] - minutes[i - 1];
    if (Number.isFinite(diff) && diff > 0) diffs.push(diff);
  }
  if (!diffs.length) return 60;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 60;
}

function getLocationLabel(locationType, locationId, papdata) {
  if (locationType === 'homes') return `Home #${locationId}`;
  if (locationType === 'places') return papdata?.places?.[locationId]?.label ?? `Place #${locationId}`;
  return 'Unknown';
}

function findPersonLocation(movementAtTime, personId, previousLocation) {
  if (previousLocation) {
    const previousPeople = movementAtTime?.[previousLocation.type]?.[previousLocation.id];
    if (includesPersonId(previousPeople, personId)) {
      return previousLocation;
    }
  }

  for (const [homeId, people] of Object.entries(movementAtTime?.homes ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'homes', id: homeId };
    }
  }

  for (const [placeId, people] of Object.entries(movementAtTime?.places ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'places', id: placeId };
    }
  }

  return { type: 'unknown', id: 'unknown' };
}

function toIsoTime(startDateMs, minute) {
  return new Date(startDateMs + minute * 60_000).toISOString();
}

function buildLocalPersonPath({ movement, personId, startDate, papdata }) {
  const startDateMs = new Date(startDate).getTime();
  if (!Number.isFinite(startDateMs)) {
    throw new Error('Simulation start date is unavailable.');
  }

  const personKey = String(personId);
  const sortedTimesteps = Object.entries(movement ?? {})
    .map(([minute, value]) => ({ minute: Number(minute), value }))
    .filter((entry) => Number.isFinite(entry.minute))
    .sort((a, b) => a.minute - b.minute);

  if (!sortedTimesteps.length) {
    return {
      person_id: personId,
      person: null,
      step_minutes: 60,
      total_minutes: 0,
      total_hours: 0,
      days: []
    };
  }

  const points = [];
  let previousLocation = null;
  for (const entry of sortedTimesteps) {
    const location = findPersonLocation(entry.value, personKey, previousLocation);
    points.push({
      minute: entry.minute,
      location_type: location.type,
      location_id: location.id
    });
    previousLocation = location.type === 'homes' || location.type === 'places'
      ? { type: location.type, id: location.id }
      : null;
  }

  const inferredStepMinutes = inferStepMinutes(points.map((point) => point.minute));

  const segments = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const nextMinute = i < points.length - 1
      ? points[i + 1].minute
      : current.minute + inferredStepMinutes;

    if (!Number.isFinite(nextMinute) || nextMinute <= current.minute) continue;

    const locationLabel = getLocationLabel(current.location_type, current.location_id, papdata);
    const previousSegment = segments[segments.length - 1];
    if (
      previousSegment
      && previousSegment.location_type === current.location_type
      && previousSegment.location_id === current.location_id
      && previousSegment.end_minute === current.minute
    ) {
      previousSegment.end_minute = nextMinute;
    } else {
      segments.push({
        location_type: current.location_type,
        location_id: current.location_id,
        location_label: locationLabel,
        start_minute: current.minute,
        end_minute: nextMinute
      });
    }
  }

  const daysMap = new Map();
  let totalMinutes = 0;

  for (const segment of segments) {
    let cursor = segment.start_minute;
    while (cursor < segment.end_minute) {
      const dayIndex = Math.floor(cursor / DAY_MINUTES) + 1;
      const dayStartMinute = (dayIndex - 1) * DAY_MINUTES;
      const dayEndMinute = dayStartMinute + DAY_MINUTES;
      const pieceEndMinute = Math.min(segment.end_minute, dayEndMinute);
      const durationMinutes = pieceEndMinute - cursor;

      if (durationMinutes <= 0) break;

      if (!daysMap.has(dayIndex)) {
        daysMap.set(dayIndex, {
          day_index: dayIndex,
          day_date_iso: toIsoTime(startDateMs, dayStartMinute).slice(0, 10),
          start_minute: dayStartMinute,
          end_minute: dayEndMinute,
          total_minutes: 0,
          stops: []
        });
      }

      const day = daysMap.get(dayIndex);
      day.stops.push({
        location_type: segment.location_type,
        location_id: segment.location_id,
        location_label: segment.location_label,
        start_minute: cursor,
        end_minute: pieceEndMinute,
        duration_minutes: durationMinutes,
        start_time_iso: toIsoTime(startDateMs, cursor),
        end_time_iso: toIsoTime(startDateMs, pieceEndMinute)
      });
      day.total_minutes += durationMinutes;
      totalMinutes += durationMinutes;
      cursor = pieceEndMinute;
    }
  }

  const days = Array.from(daysMap.values())
    .sort((a, b) => a.day_index - b.day_index)
    .map((day) => {
      const totalsByLocation = new Map();
      for (const stop of day.stops) {
        const key = `${stop.location_type}:${stop.location_id}`;
        const existing = totalsByLocation.get(key);
        if (existing) {
          existing.duration_minutes += stop.duration_minutes;
          existing.duration_hours = Number((existing.duration_minutes / 60).toFixed(2));
          existing.visits += 1;
        } else {
          totalsByLocation.set(key, {
            location_type: stop.location_type,
            location_id: stop.location_id,
            location_label: stop.location_label,
            duration_minutes: stop.duration_minutes,
            duration_hours: Number((stop.duration_minutes / 60).toFixed(2)),
            visits: 1
          });
        }
      }

      return {
        ...day,
        total_hours: Number((day.total_minutes / 60).toFixed(2)),
        totals: Array.from(totalsByLocation.values()).sort((a, b) => b.duration_minutes - a.duration_minutes)
      };
    });

  const personData = papdata?.people?.[personKey];
  const person = personData
    ? {
      id: personId,
      age: personData?.age ?? null,
      sex: personData?.sex === 0 ? 'Male' : (personData?.sex === 1 ? 'Female' : 'Unknown'),
      home: personData?.home ?? null
    }
    : null;

  return {
    person_id: personId,
    person,
    step_minutes: inferredStepMinutes,
    total_minutes: totalMinutes,
    total_hours: Number((totalMinutes / 60).toFixed(2)),
    days
  };
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function formatDayLabel(dayIso) {
  return new Date(`${dayIso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatDuration(minutes) {
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${minutes}m`;
}

export default function PersonPathPanel({ selectedZone, simId, rawMovement, papdata }) {
  const [personIdInput, setPersonIdInput] = useState('');
  const [selectedDay, setSelectedDay] = useState('all');
  const [pathData, setPathData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedDays, setExpandedDays] = useState({});

  const allPersonIds = useMemo(() => (
    Object.keys(papdata?.people ?? {})
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b)
  ), [papdata]);

  const filteredDays = useMemo(() => {
    if (!pathData?.days) return [];
    if (selectedDay === 'all') return pathData.days;
    return pathData.days.filter((day) => String(day.day_index) === String(selectedDay));
  }, [pathData, selectedDay]);

  const fetchPathData = async (personId) => {
    if (simId) {
      const url = new URL(`${DB_URL}simdata/${simId}/person-path`);
      url.searchParams.set('person_id', String(personId));
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load person path (${res.status})`);
      }
      const json = await res.json();
      return json.data;
    }

    if (!rawMovement) {
      throw new Error('No movement data available yet.');
    }

    return buildLocalPersonPath({
      movement: rawMovement,
      personId,
      startDate: selectedZone?.start_date,
      papdata
    });
  };

  const handleLoad = async () => {
    const personId = Number(personIdInput);
    if (!Number.isInteger(personId) || personId < 0) {
      setError('Enter a valid non-negative person ID.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextPathData = await fetchPathData(personId);
      setPathData(nextPathData);
      setSelectedDay('all');
      setExpandedDays({});
    } catch (e) {
      console.error(e);
      setPathData(null);
      setError(e?.message || 'Failed to load person path.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDayExpansion = (dayIndex) => {
    setExpandedDays((prev) => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  return (
    <div className='w-full outline-solid outline-2 outline-[#70B4D4] bg-[#fffff2] px-3 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Person Movement Explorer</h3>
        <span className='text-xs text-gray-600'>
          {allPersonIds.length
            ? `Known IDs: ${allPersonIds[0]}-${allPersonIds[allPersonIds.length - 1]}`
            : 'Person IDs unavailable'}
        </span>
      </div>

      <div className='mt-2 flex flex-wrap items-center gap-2'>
        <input
          className='w-44 rounded px-2 py-1 text-sm bg-white outline-solid outline-2 outline-[#70B4D4]'
          type='number'
          min={0}
          step={1}
          value={personIdInput}
          onChange={(e) => setPersonIdInput(e.target.value)}
          placeholder='Enter person ID'
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLoad();
          }}
        />
        <button
          onClick={handleLoad}
          disabled={isLoading}
          className='bg-[#70B4D4] hover:brightness-95 disabled:opacity-60 text-white text-xs py-2 px-3 rounded'
        >
          {isLoading ? 'Loading...' : 'Load Path'}
        </button>
        {pathData?.days?.length > 0 && (
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className='rounded px-2 py-1 text-xs bg-white outline-solid outline-2 outline-[#70B4D4]'
          >
            <option value='all'>All Days</option>
            {pathData.days.map((day) => (
              <option key={day.day_index} value={day.day_index}>
                Day {day.day_index} ({formatDayLabel(day.day_date_iso)})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className='mt-2 text-xs text-red-600'>{error}</div>
      )}

      {pathData && (
        <div className='mt-3 space-y-3'>
          <div className='text-xs text-gray-700'>
            <span className='font-semibold'>Person #{pathData.person_id}</span>
            {pathData.person && (
              <>
                {' '}| Age {pathData.person.age ?? '-'} | {pathData.person.sex ?? 'Unknown'} | Home #{pathData.person.home ?? '-'}
              </>
            )}
            {' '}| {pathData.total_hours}h tracked | {pathData.days.length} day(s)
          </div>

          {filteredDays.length === 0 ? (
            <div className='text-xs text-gray-600'>No movement segments found for this person.</div>
          ) : (
            <div className='space-y-3'>
              {filteredDays.map((day) => {
                const isExpanded = Boolean(expandedDays[day.day_index]);
                const visibleStops = isExpanded ? day.stops : day.stops.slice(0, MAX_VISIBLE_STOPS);
                return (
                  <div key={day.day_index} className='rounded border border-[#d7e8f1] bg-white p-2'>
                    <div className='flex flex-wrap items-center justify-between gap-1 text-xs'>
                      <div className='font-semibold'>Day {day.day_index} - {formatDayLabel(day.day_date_iso)}</div>
                      <div className='text-gray-600'>{day.total_hours}h tracked</div>
                    </div>

                    <div className='mt-2 space-y-1 text-xs'>
                      {visibleStops.map((stop, index) => (
                        <div
                          key={`${day.day_index}-${index}-${stop.start_minute}`}
                          className='grid grid-cols-[1fr_1fr_2fr_auto] gap-2 rounded px-2 py-1 odd:bg-[#f7fbfe]'
                        >
                          <span>{formatDateTime(stop.start_time_iso)}</span>
                          <span>{formatDateTime(stop.end_time_iso)}</span>
                          <span>{stop.location_label}</span>
                          <span className='font-semibold'>{formatDuration(stop.duration_minutes)}</span>
                        </div>
                      ))}
                    </div>

                    {day.stops.length > MAX_VISIBLE_STOPS && (
                      <button
                        className='mt-2 text-xs text-[#2a6f92] underline'
                        onClick={() => toggleDayExpansion(day.day_index)}
                      >
                        {isExpanded ? 'Show fewer stops' : `Show all ${day.stops.length} stops`}
                      </button>
                    )}

                    {day.totals?.length > 0 && (
                      <div className='mt-2 border-t border-[#e6eef3] pt-2'>
                        <div className='text-xs font-semibold mb-1'>Top locations by time</div>
                        <div className='grid gap-1 text-xs'>
                          {day.totals.slice(0, 5).map((total) => (
                            <div key={`${day.day_index}-${total.location_type}-${total.location_id}`} className='flex justify-between gap-2'>
                              <span>{total.location_label}</span>
                              <span>{formatDuration(total.duration_minutes)} ({total.visits} visit{total.visits === 1 ? '' : 's'})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
