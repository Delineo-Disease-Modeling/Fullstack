import type { ConvenienceZone } from '@/stores/simsettings';

const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY'
};

export function getStateFromCBG(cbgList?: string[] | null): string | null {
  if (!cbgList?.length) return null;
  const fips = cbgList[0]?.slice(0, 2);
  return (fips && FIPS_TO_STATE[fips]) || null;
}

export function getInclusiveEndDateIso(
  startDate?: string | null,
  lengthHours?: number | null
): string | null {
  if (!startDate) return null;

  const start = new Date(startDate);
  const hours = Number(lengthHours);

  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  return new Date(start.getTime() + hours * 60 * 60 * 1000 - 1).toISOString();
}

export function toSimulationDateParam(isoString?: string | null): string | null {
  if (!isoString) return null;

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
}

export function formatDateDisplay(isoString?: string | null): string {
  if (!isoString) return 'N/A';

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getZoneLocationName(
  zone?: Pick<ConvenienceZone, 'description' | 'name'> | null
): string {
  return (zone?.description || zone?.name || 'barnsdall')
    .toLowerCase()
    .replace(/\s+/g, '');
}
