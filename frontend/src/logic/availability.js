import { activeMembers, liveAllocations, liveHolidays, liveLeaves, memberById } from '../db/store';
import { addDays, eachDay, isWeekend, today } from '../db/util';
import { holidayMap } from './holidays';

export const LEAVE_TYPES = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal day',
  OTHER: 'Other',
  HOLIDAY: 'Public holiday / day in lieu', // no longer offered (public holidays are on the calendar); old entries still show
};

/** Types offered in the leave form. A legacy HOLIDAY entry keeps its own type while it is being edited. */
export const leaveTypeChoices = (current) => Object.keys(LEAVE_TYPES).filter((k) => k !== 'HOLIDAY' || current === 'HOLIDAY');

/** "Vacation", or for Other the reason the manager gave: "Other: jury duty". */
export const leaveLabel = (leave) => (leave.type === 'OTHER' && leave.note ? `Other: ${leave.note}` : LEAVE_TYPES[leave.type]);

/** A working day is Monday to Friday and not an enabled holiday. */
export function workday(date, holidays) {
  return !isWeekend(date) && !holidays.has(date);
}

/**
 * Who is out each day in [from, to]: Map date -> [{member, leave}]. Only active members; weekends and holidays
 * are skipped because nobody is expected to work them.
 */
export function outByDay(state, from, to, enabledHolidays) {
  const holidays = holidayMap(from, to, enabledHolidays, liveHolidays(state));
  const members = new Map(activeMembers(state).map((m) => [m.id, m]));
  const leaves = liveLeaves(state).filter((l) => members.has(l.memberId) && l.endDate >= from && l.startDate <= to);
  const out = new Map();
  for (const day of eachDay(from, to)) {
    out.set(day, workday(day, holidays)
      ? leaves.filter((l) => l.startDate <= day && day <= l.endDate).map((leave) => ({ member: members.get(leave.memberId), leave }))
      : []);
  }
  return { out, holidays, total: members.size, members: [...members.values()] };
}

/** 'none' | 'one' | 'multi' (2+) | 'high' (at or over the threshold) */
export function levelOf(count, maxOut) {
  if (count >= Math.max(2, maxOut)) return 'high';
  if (count >= 2) return 'multi';
  return count === 1 ? 'one' : 'none';
}

/** Availability for one day: who can be reached and who is out (and why). */
export function availabilityOn(state, date, enabledHolidays) {
  const { out, holidays, members } = outByDay(state, date, date, enabledHolidays);
  const outList = out.get(date);
  const outIds = new Set(outList.map((o) => o.member.id));
  return {
    date,
    holiday: holidays.get(date) ?? null,
    weekend: isWeekend(date),
    out: outList,
    available: members.filter((m) => !outIds.has(m.id)),
    total: members.length,
  };
}

export const allocationOn = (state, memberId, date) =>
  liveAllocations(state)
    .filter((a) => a.memberId === memberId && a.startDate <= date && (!a.endDate || date <= a.endDate))
    .reduce((sum, a) => sum + a.percent, 0);

const HEAVY = 80;

/**
 * Upcoming days (next `days` days) with two or more people out, merged into runs of the same people, plus leave
 * that lands on someone whose allocation is heavy. Used by the calendar's "Heads-up" list.
 */
export function upcomingConflicts(state, enabledHolidays, maxOut, days = 90) {
  const from = today();
  const to = addDays(from, days);
  const { out } = outByDay(state, from, to, enabledHolidays);
  const runs = [];
  for (const [date, list] of out) {
    if (list.length < 2) continue;
    const key = list.map((o) => o.member.id).sort().join(',');
    const last = runs[runs.length - 1];
    if (last && last.key === key && addDays(last.to, 1) >= date) last.to = date;
    else runs.push({ key, from: date, to: date, people: list.map((o) => o.member), level: levelOf(list.length, maxOut) });
  }
  const heavy = [];
  for (const leave of liveLeaves(state)) {
    const m = memberById(state, leave.memberId);
    if (!m || m.archived || leave.endDate < from || leave.startDate > to) continue;
    const start = leave.startDate < from ? from : leave.startDate;
    const projects = liveAllocations(state).filter((a) => a.memberId === m.id && a.startDate <= leave.endDate && (!a.endDate || a.endDate >= start));
    const peak = Math.max(0, ...eachDay(start, leave.endDate > to ? to : leave.endDate).map((d) => allocationOn(state, m.id, d)));
    if (peak >= HEAVY) heavy.push({ leave, member: m, peak, projects: [...new Set(projects.map((p) => p.project))] });
  }
  return { runs, heavy: heavy.sort((a, b) => a.leave.startDate.localeCompare(b.leave.startDate)) };
}
