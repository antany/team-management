import { useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { applySync, dirtyRows, hasDirty, subscribe, TABLES } from '../db/store';

/**
 * Keeps the local store and the server in step while someone is signed in and the app is unlocked. Every
 * round trip pushes the dirty rows and pulls everything newer than the cursor; conflicts are last-write-wins
 * per row (see store.applySync). The cursor lives in localStorage ("team.sync") next to the owner id.
 */
const META_KEY = 'team.sync';
const BATCH = 2000; // rows per table per request (the server accepts 5000)

export const readCursor = () => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY))?.cursor ?? 0;
  } catch {
    return 0;
  }
};
const writeCursor = (cursor) => {
  try { localStorage.setItem(META_KEY, JSON.stringify({ cursor })); } catch { /* storage blocked */ }
};
export const resetCursor = () => writeCursor(0);

// state: idle | syncing | offline | error
let status = { state: 'idle', lastSyncAt: null, error: null };
const watchers = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  watchers.forEach((w) => w());
}
export const useSyncStatus = () =>
  useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb); }, () => status);

let running = false;
let again = false;
let applying = false;
let active = false;
let onUnauthorized = () => {};
let debounce = null;
let heartbeat = null;
let unsubscribe = null;

function snapshot() {
  const changes = {};
  const sent = {};
  let more = false;
  for (const t of TABLES) {
    const rows = dirtyRows(t, BATCH + 1);
    if (rows.length > BATCH) more = true;
    const batch = rows.slice(0, BATCH);
    changes[t] = batch;
    sent[t] = new Map(batch.map((r) => [r.id, r.updatedAt]));
  }
  return { changes, sent, more };
}

async function roundTrip(changes, sent) {
  const resp = await api.post('/api/sync', { cursor: readCursor(), changes });
  applying = true;
  try {
    applySync({ sent, changes: resp.changes, rejected: resp.rejected ?? [] });
  } finally {
    applying = false;
  }
  writeCursor(resp.cursor);
}

async function run() {
  if (!active) return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  running = true;
  setStatus({ state: 'syncing', error: null });
  try {
    let more;
    do {
      again = false;
      const snap = snapshot();
      await roundTrip(snap.changes, snap.sent);
      more = snap.more || (again && hasDirty());
    } while (more);
    setStatus({ state: 'idle', lastSyncAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setStatus({ state: 'idle' });
      onUnauthorized(); // the session ended: the session provider shows the login page
    } else if (e instanceof ApiError) {
      setStatus({ state: 'error', error: e.message });
    } else {
      setStatus({ state: navigator.onLine ? 'error' : 'offline', error: 'Could not reach the server' });
    }
  } finally {
    running = false;
  }
}

export const syncNow = () => run();

/** Push everything now and wait for it; true when nothing is left unsynced. Used before signing out. */
export async function flushNow() {
  if (!navigator.onLine) return !hasDirty();
  await run();
  return !hasDirty();
}

function schedule(ms = 2000) {
  clearTimeout(debounce);
  debounce = setTimeout(run, ms);
}

const onChange = () => { if (!applying && hasDirty()) schedule(); };
const onVisible = () => document.visibilityState === 'visible' && schedule(0);
const onOnline = () => schedule(0);
const onOffline = () => setStatus({ state: 'offline' });

export function startSync({ unauthorized } = {}) {
  stopSync();
  active = true;
  onUnauthorized = unauthorized ?? (() => {});
  setStatus({ state: 'idle' });
  unsubscribe = subscribe(onChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  heartbeat = setInterval(run, 60_000);
  schedule(0);
}

export function stopSync() {
  active = false;
  clearTimeout(debounce);
  clearInterval(heartbeat);
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  setStatus({ state: 'idle' });
}

export const isSyncing = () => running;
