import { useSyncExternalStore } from 'react';
import * as vault from './vault';
import { addDays, nowIso, today, uid } from './util';

/**
 * The single source of truth while the app is unlocked: { members, leaves, allocations, notes, holidays (custom) }.
 * Persisted through the vault (plain or PIN-encrypted localStorage). Every mutation stamps updatedAt and sets
 * dirty; deletes are tombstones (deleted: true) so sync can propagate them. Locking empties this state.
 */
export const TABLES = ['members', 'leaves', 'allocations', 'notes', 'holidays'];
const empty = () => ({ members: [], leaves: [], allocations: [], notes: [], holidays: [] });

let state = empty();
const watchers = new Set();
let persistTimer = null;

export const getState = () => state;
export const subscribe = (cb) => { watchers.add(cb); return () => watchers.delete(cb); };
export const useStore = () => useSyncExternalStore(subscribe, getState);

function emit() {
  watchers.forEach((w) => w());
}

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flush, 250);
}

/** Write to disk now. */
export function flush() {
  clearTimeout(persistTimer);
  persistTimer = null;
  return vault.save(state);
}

function set(next, persist = true) {
  state = next;
  emit();
  if (persist) persistSoon();
}

/** Replace the in-memory state (after unlocking or loading the plain cache). Does not write. */
export function loadState(data) {
  state = { ...empty(), ...data };
  emit();
}

/** Drop everything from memory (lock). The cache on disk is untouched. */
export function clearState() {
  clearTimeout(persistTimer);
  persistTimer = null;
  state = empty();
  emit();
}

// ---------- mutations ----------
const stamp = (row) => ({ ...row, updatedAt: nowIso(), dirty: true });
const replace = (table, id, fn) =>
  set({ ...state, [table]: state[table].map((r) => (r.id === id ? fn(r) : r)) });

export function create(table, fields) {
  const row = stamp({ id: uid(), deleted: false, ...fields });
  set({ ...state, [table]: [...state[table], row] });
  return row.id;
}

export function update(table, id, patch) {
  replace(table, id, (r) => stamp({ ...r, ...patch }));
}

/** Tombstone a row. Removing a member also removes everything that belongs to them. */
export function remove(table, id) {
  if (table !== 'members') return replace(table, id, (r) => stamp({ ...r, deleted: true }));
  const next = { ...state };
  for (const t of TABLES) {
    next[t] = state[t].map((r) => ((t === 'members' ? r.id === id : r.memberId === id) && !r.deleted ? stamp({ ...r, deleted: true }) : r));
  }
  set(next);
}

/** Undo for a delete: bring a tombstoned row (and a member's children, deleted at the same moment) back. */
export function restore(table, id, alsoChildren = false) {
  const gone = state[table].find((r) => r.id === id);
  if (!gone) return;
  const next = { ...state, [table]: state[table].map((r) => (r.id === id ? stamp({ ...r, deleted: false }) : r)) };
  if (table === 'members' && alsoChildren) {
    for (const t of TABLES.filter((x) => x !== 'members')) {
      next[t] = state[t].map((r) => (r.memberId === id && r.deleted && r.updatedAt >= gone.updatedAt ? stamp({ ...r, deleted: false }) : r));
    }
  }
  set(next);
}

// ---------- selectors ----------
const live = (rows) => rows.filter((r) => !r.deleted);
export const liveMembers = (s) => live(s.members).sort((a, b) => a.name.localeCompare(b.name));
export const activeMembers = (s) => liveMembers(s).filter((m) => !m.archived);
export const memberById = (s, id) => s.members.find((m) => m.id === id && !m.deleted);
export const liveLeaves = (s) => live(s.leaves);
export const liveAllocations = (s) => live(s.allocations);
export const liveNotes = (s) => live(s.notes);
export const liveHolidays = (s) => live(s.holidays).sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
export const leavesOf = (s, memberId) => liveLeaves(s).filter((l) => l.memberId === memberId).sort((a, b) => b.startDate.localeCompare(a.startDate));
export const allocationsOf = (s, memberId) => liveAllocations(s).filter((a) => a.memberId === memberId).sort((a, b) => b.startDate.localeCompare(a.startDate));
export const notesOf = (s, memberId) => liveNotes(s).filter((n) => n.memberId === memberId).sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.updatedAt.localeCompare(a.updatedAt));

/** Open follow-ups, soonest first. dueBy limits to follow-up dates on or before that date. */
export function openFollowUps(s, dueBy) {
  return liveNotes(s)
    .filter((n) => n.followUpDate && !n.done && (!dueBy || n.followUpDate <= dueBy) && memberById(s, n.memberId))
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
}

// ---------- sync support ----------
const wire = (r) => { const { dirty, ...rest } = r; return rest; }; // eslint-disable-line no-unused-vars
export const dirtyRows = (table, limit) => state[table].filter((r) => r.dirty).slice(0, limit).map(wire);
export const hasDirty = () => TABLES.some((t) => state[t].some((r) => r.dirty));

/**
 * Merge a sync response. `sent` is {table: Map(id -> updatedAt)} of what was pushed: those rows are acked
 * (dirty cleared) unless edited since. Server rows replace local ones unless the local row is dirty and newer.
 */
export function applySync({ sent, changes, rejected }) {
  const next = { ...state };
  for (const t of TABLES) {
    const byId = new Map(state[t].map((r) => [r.id, r]));
    for (const [id, at] of sent[t] ?? []) {
      const r = byId.get(id);
      if (r && r.updatedAt === at) byId.set(id, { ...r, dirty: false });
    }
    for (const reject of rejected.filter((x) => x.table === t && x.reason !== 'missing_parent')) {
      const r = byId.get(reject.id);
      if (r) byId.set(reject.id, { ...r, dirty: false }); // the server will not take it; stop retrying
    }
    for (const row of changes[t] ?? []) {
      const local = byId.get(row.id);
      if (local?.dirty && local.updatedAt > row.updatedAt) continue;
      byId.set(row.id, { ...row, dirty: false });
    }
    next[t] = [...byId.values()];
  }
  set(next);
}

export function markAllDirty() {
  const next = {};
  for (const t of TABLES) next[t] = state[t].map((r) => ({ ...r, dirty: true }));
  set(next);
}

// ---------- demo data (Settings > "Add sample data") ----------
export function addSampleData() {
  const t = today();
  const names = [['Priya Shah', 'Senior Engineer'], ['Marcus Lee', 'Engineer'], ['Ana Costa', 'Designer'], ['Tom Becker', 'QA Lead']];
  const ids = names.map(([name, title]) => create('members', { name, title, startDate: addDays(t, -400), about: '', archived: false }));
  create('leaves', { memberId: ids[0], startDate: addDays(t, 6), endDate: addDays(t, 10), type: 'VACATION', note: '' });
  create('leaves', { memberId: ids[1], startDate: addDays(t, 8), endDate: addDays(t, 12), type: 'VACATION', note: '' });
  create('allocations', { memberId: ids[0], project: 'Apollo', percent: 60, startDate: addDays(t, -60), endDate: null, note: '' });
  create('allocations', { memberId: ids[0], project: 'Support rota', percent: 50, startDate: addDays(t, -30), endDate: null, note: '' });
  create('allocations', { memberId: ids[1], project: 'Apollo', percent: 100, startDate: addDays(t, -90), endDate: null, note: '' });
  create('notes', { memberId: ids[0], category: 'ONE_ON_ONE', body: 'Wants to lead the next release. Agreed to shadow the planning session.', noteDate: addDays(t, -10), followUpDate: addDays(t, 2), done: false });
  create('notes', { memberId: ids[1], category: 'KUDOS', body: 'Handled the outage calmly and wrote a clear post-mortem.', noteDate: addDays(t, -20), followUpDate: null, done: false });
}
