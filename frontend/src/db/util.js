export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowIso = () => new Date().toISOString();

// Calendar dates are plain 'YYYY-MM-DD' strings (no time zone), so they compare with < and > directly.
const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => toDateStr(new Date());
export const addDays = (s, n) => {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};
/** Same day of the month n months later, clamped to the end of a shorter month (Jan 31 + 1 = Feb 28). */
export const addMonths = (s, n) => {
  const d = fromDateStr(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toDateStr(d);
};
export const daysBetween = (a, b) => Math.round((fromDateStr(b) - fromDateStr(a)) / 86400000);
/** 0 = Sunday ... 6 = Saturday */
export const weekday = (s) => fromDateStr(s).getDay();
export const isWeekend = (s) => [0, 6].includes(weekday(s));
export const mondayOf = (s) => addDays(s, -((weekday(s) + 6) % 7));
export const monthStart = (s) => `${s.slice(0, 7)}-01`;
export const eachDay = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export function dayLabel(s) {
  if (!s) return '';
  const diff = daysBetween(today(), s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return (s.slice(0, 4) === today().slice(0, 4) ? dayFmt : dayYearFmt).format(fromDateStr(s));
}
export const shortDate = (s) => (s ? shortFmt.format(fromDateStr(s)) : '');
export const monthLabel = (s) => monthFmt.format(fromDateStr(s));
export function rangeLabel(a, b) {
  if (!b || a === b) return dayLabel(a);
  // Years are shown whenever the range is not entirely inside the current year, so "Oct 31 to Oct 31" never happens.
  const thisYear = today().slice(0, 4);
  const plain = a.slice(0, 4) === b.slice(0, 4) && b.slice(0, 4) === thisYear;
  return plain ? `${shortDate(a)} to ${shortDate(b)}` : `${shortDate(a)}, ${a.slice(0, 4)} to ${shortDate(b)}, ${b.slice(0, 4)}`;
}
