import { allocationsOf, leavesOf, liveHolidays, memberById, notesOf } from '../db/store';
import { daysBetween, eachDay, rangeLabel, shortDate, today } from '../db/util';
import { LEAVE_TYPES, leaveLabel, workday } from './availability';
import { holidayMap } from './holidays';

export const CATEGORIES = {
  ONE_ON_ONE: '1:1',
  FEEDBACK: 'Feedback',
  KUDOS: 'Kudos',
  CONCERN: 'Concern',
  GOAL: 'Goal',
  OTHER: 'Other',
};
export const CATEGORY_ORDER = ['KUDOS', 'GOAL', 'FEEDBACK', 'CONCERN', 'ONE_ON_ONE', 'OTHER'];

/**
 * Prep material for a performance review, built only from what the manager recorded for the period. Nothing
 * is interpreted or scored: it groups, counts and lists, and the manager writes the review themselves.
 */
export function buildReview(state, memberId, from, to, enabledHolidays) {
  const member = memberById(state, memberId);
  if (!member) return null;
  const holidays = holidayMap(from, to, enabledHolidays, liveHolidays(state));

  const leaves = leavesOf(state, memberId).filter((l) => l.startDate <= to && l.endDate >= from).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const leaveDays = Object.fromEntries(Object.keys(LEAVE_TYPES).map((k) => [k, 0]));
  for (const l of leaves) {
    const a = l.startDate < from ? from : l.startDate;
    const b = l.endDate > to ? to : l.endDate;
    leaveDays[l.type] += eachDay(a, b).filter((d) => workday(d, holidays)).length;
  }

  const allocations = allocationsOf(state, memberId)
    .filter((a) => a.startDate <= to && (!a.endDate || a.endDate >= from))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  // Per project: how much of their time while the work was active (not averaged over the whole period, which
  // would understate a project that only ran for two months), plus each stretch with its own percentage.
  const projects = new Map();
  for (const a of allocations) {
    const s = a.startDate < from ? from : a.startDate;
    const ongoing = !a.endDate || a.endDate >= to;
    const e = ongoing ? to : a.endDate;
    const days = daysBetween(s, e) + 1;
    const p = projects.get(a.project) ?? { project: a.project, activeDays: 0, weighted: 0, segments: [], notes: [] };
    p.activeDays += days;
    p.weighted += a.percent * days;
    p.segments.push({ percent: a.percent, from: s, to: e, ongoing });
    if (a.note) p.notes.push(a.note);
    projects.set(a.project, p);
  }
  const projectList = [...projects.values()]
    .map((p) => ({ ...p, averagePercent: Math.round(p.weighted / p.activeDays) }))
    .sort((a, b) => b.weighted - a.weighted);

  const notes = notesOf(state, memberId).filter((n) => n.noteDate >= from && n.noteDate <= to).sort((a, b) => a.noteDate.localeCompare(b.noteDate));
  const byCategory = CATEGORY_ORDER.map((c) => ({ category: c, label: CATEGORIES[c], notes: notes.filter((n) => n.category === c) })).filter((g) => g.notes.length);

  const followUps = notes.filter((n) => n.followUpDate);
  const done = followUps.filter((n) => n.done).length;
  const overdue = followUps.filter((n) => !n.done && n.followUpDate < today()).length;

  return {
    member, from, to, leaves, leaveDays,
    leaveTotal: Object.values(leaveDays).reduce((s, n) => s + n, 0),
    allocations, projects: projectList,
    notes, byCategory,
    followUps: { total: followUps.length, done, open: followUps.length - done, overdue },
  };
}

/** "60% Sep 1 to now; 40% Oct 1 to Oct 20 (61 days active)" */
export function segmentsText(p) {
  const parts = p.segments.map((g) => `${g.percent}% ${g.ongoing ? `from ${shortDate(g.from)} (ongoing)` : rangeLabel(g.from, g.to)}`);
  return `${parts.join('; ')} · ${p.activeDays} day${p.activeDays === 1 ? '' : 's'} active`;
}

export function reviewMarkdown(r) {
  const L = [];
  L.push(`# Review prep: ${r.member.name}`);
  L.push(`${r.member.title ? `${r.member.title} · ` : ''}${rangeLabel(r.from, r.to)}`, '');
  L.push('## Leave');
  if (!r.leaves.length) L.push('No leave recorded.');
  else {
    L.push(`${r.leaveTotal} working day${r.leaveTotal === 1 ? '' : 's'} away: ${Object.entries(r.leaveDays).filter(([, n]) => n).map(([k, n]) => `${LEAVE_TYPES[k]} ${n}`).join(', ')}.`);
    r.leaves.forEach((l) => L.push(`- ${rangeLabel(l.startDate, l.endDate)} (${leaveLabel(l)})${l.note && l.type !== 'OTHER' ? `: ${l.note}` : ''}`));
  }
  L.push('', '## Work allocation');
  if (!r.projects.length) L.push('No allocations recorded.');
  r.projects.forEach((p) => L.push(`- **${p.project}**: ${segmentsText(p)}${p.notes.length ? `. ${p.notes.join(' ')}` : ''}`));
  L.push('', '## Notes');
  if (!r.byCategory.length) L.push('No notes recorded.');
  r.byCategory.forEach((g) => {
    L.push(`### ${g.label} (${g.notes.length})`);
    g.notes.forEach((n) => L.push(`- ${n.noteDate}: ${n.body.replace(/\n+/g, ' ')}${n.followUpDate ? ` _(follow-up ${n.followUpDate}${n.done ? ', done' : ''})_` : ''}`));
  });
  L.push('', '## Follow-ups');
  L.push(`${r.followUps.total} set, ${r.followUps.done} done, ${r.followUps.open} open${r.followUps.overdue ? ` (${r.followUps.overdue} overdue)` : ''}.`);
  return L.join('\n');
}

