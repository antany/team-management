import { activeMembers, liveAllocations } from '../db/store';
import { addDays, mondayOf } from '../db/util';

/** Allocations of one member overlapping a date range, with their percentages. */
export function overlapping(allocs, from, to) {
  return allocs.filter((a) => a.startDate <= to && (!a.endDate || a.endDate >= from));
}

/**
 * Total allocation % of a member on a day. Used for the weekly load grid: a week shows the highest day, so a
 * mid-week project start still shows the overload.
 */
export function loadOn(allocs, date) {
  return allocs.filter((a) => a.startDate <= date && (!a.endDate || date <= a.endDate)).reduce((s, a) => s + a.percent, 0);
}

export function weekLoad(allocs, monday) {
  let peak = 0;
  for (let i = 0; i < 5; i++) peak = Math.max(peak, loadOn(allocs, addDays(monday, i)));
  return peak;
}

/** Rows for the team grid: each active member with their load for `weeks` weeks starting at the Monday of `from`. */
export function teamLoad(state, from, weeks) {
  const start = mondayOf(from);
  const all = liveAllocations(state);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(start, i * 7));
  return {
    mondays,
    rows: activeMembers(state).map((m) => {
      const allocs = all.filter((a) => a.memberId === m.id);
      return { member: m, allocs, loads: mondays.map((mon) => weekLoad(allocs, mon)) };
    }),
  };
}

export const loadColor = (pct) => (pct > 100 ? 'error' : pct === 100 ? 'warning' : pct >= 60 ? 'success' : 'default');
