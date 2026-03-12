export function getInclusiveEndDateIso(startDate, lengthHours) {
  if (!startDate) return null;

  const start = new Date(startDate);
  const hours = Number(lengthHours);

  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  return new Date(start.getTime() + hours * 60 * 60 * 1000 - 1).toISOString();
}

export function toSimulationDateParam(isoString) {
  if (!isoString) return null;

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
}
