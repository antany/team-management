import { useSyncExternalStore } from 'react';

// Device preferences. Not sensitive, so kept in plain localStorage (readable while the app is locked).
const KEY = 'team.settings';
export const DEFAULTS = {
  idleMinutes: 2,      // 0 = never
  lockOnHide: true,    // lock the moment the tab/app is hidden
  maxOut: 3,           // flag a day red when this many people are out
  holidays: { ontario: true, federal: true, optional: false },
};

let value = load();
const watchers = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) ?? {};
    return { ...DEFAULTS, ...s, holidays: { ...DEFAULTS.holidays, ...s.holidays } };
  } catch {
    return DEFAULTS;
  }
}

export const getSettings = () => value;

export function updateSettings(patch) {
  value = { ...value, ...patch, holidays: { ...value.holidays, ...patch.holidays } };
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
  watchers.forEach((w) => w());
}

export const useSettings = () =>
  useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb); }, getSettings);
