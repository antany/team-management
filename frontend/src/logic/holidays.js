import { addDays, toDateStr } from '../db/util';

// Ontario statutory holidays, the federal / bank holidays Ontario does not give by law, and the common
// optional one. Dates are the calendar day itself; weekend substitutions are not shown.
const nthWeekday = (year, month, weekday, n) => {
  const first = new Date(year, month, 1);
  return toDateStr(new Date(year, month, 1 + ((7 + weekday - first.getDay()) % 7) + (n - 1) * 7));
};
const lastWeekdayBefore = (year, month, day, weekday) => {
  const d = new Date(year, month, day - 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return toDateStr(d);
};
function easter(year) { // anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDateStr(new Date(year, month - 1, day));
}

export const HOLIDAY_GROUPS = [
  { key: 'ontario', label: 'Ontario statutory holidays' },
  { key: 'federal', label: 'Federal and bank holidays (Remembrance Day, Truth and Reconciliation)' },
  { key: 'optional', label: 'Civic Holiday (optional)' },
];

export function holidaysOfYear(year) {
  const y = String(year);
  const goodFriday = addDays(easter(year), -2);
  return [
    { date: `${y}-01-01`, name: "New Year's Day", group: 'ontario' },
    { date: nthWeekday(year, 1, 1, 3), name: 'Family Day', group: 'ontario' },
    { date: goodFriday, name: 'Good Friday', group: 'ontario' },
    { date: lastWeekdayBefore(year, 4, 25, 1), name: 'Victoria Day', group: 'ontario' },
    { date: `${y}-07-01`, name: 'Canada Day', group: 'ontario' },
    { date: nthWeekday(year, 8, 1, 1), name: 'Labour Day', group: 'ontario' },
    { date: nthWeekday(year, 9, 1, 2), name: 'Thanksgiving', group: 'ontario' },
    { date: `${y}-12-25`, name: 'Christmas Day', group: 'ontario' },
    { date: `${y}-12-26`, name: 'Boxing Day', group: 'ontario' },
    { date: `${y}-09-30`, name: 'National Day for Truth and Reconciliation', group: 'federal' },
    { date: `${y}-11-11`, name: 'Remembrance Day', group: 'federal' },
    { date: nthWeekday(year, 7, 1, 1), name: 'Civic Holiday', group: 'optional' },
  ];
}

/**
 * Map date -> holiday name for [from, to]: the built-in groups that are switched on, plus every custom holiday
 * the manager added (those are always on; delete one to remove it).
 */
export function holidayMap(from, to, enabled, custom = []) {
  const map = new Map();
  for (const h of custom) if (!h.deleted && h.holidayDate >= from && h.holidayDate <= to) map.set(h.holidayDate, h.name);
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysOfYear(y)) if (enabled[h.group] && h.date >= from && h.date <= to && !map.has(h.date)) map.set(h.date, h.name);
  }
  return map;
}
