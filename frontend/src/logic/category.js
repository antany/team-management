/** Teams a member can belong to. `color` identifies the team on the calendar. */
export const TEAMS = {
  DEV: { label: 'Dev', color: '#2979ff' },
  BSA: { label: 'BSA', color: '#8e24aa' },
  QA: { label: 'QA', color: '#00897b' },
  ENGINEER: { label: 'Engineer', color: '#546e7a' },
};

export const STATUS_COLOR = { ok: null, half: '#ed6c02', all: '#d32f2f' };

/** 'all' when everyone in the team is out, 'half' when more than half are, else 'ok'. */
export function categoryStatus(out, total) {
  if (total > 0 && out >= total) return 'all';
  return total > 0 && out * 2 > total ? 'half' : 'ok';
}

/**
 * Per team on one day: [{key, total, out, status, color}] for teams that have members.
 * `members` are the active members, `outIds` the ids of those who are out that day.
 */
export function categoryCoverage(members, outIds) {
  return Object.keys(TEAMS).map((key) => {
    const mine = members.filter((m) => m.category === key);
    const out = mine.filter((m) => outIds.has(m.id)).length;
    const status = categoryStatus(out, mine.length);
    return { key, total: mine.length, out, status, color: STATUS_COLOR[status] ?? TEAMS[key].color };
  }).filter((c) => c.total > 0);
}
