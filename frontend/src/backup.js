import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import * as vault from './db/vault';
import { decryptJson, keyFromPin } from './crypto';
import { getState, liveAllocations, liveHolidays, liveLeaves, liveMembers, liveNotes } from './db/store';
import { toDateStr } from './db/util';

/**
 * Backups are JSON, encrypted in the app with the key derived from the PIN, so neither the file you download
 * nor the copy kept on the server can be read without the PIN (the PIN never leaves the device).
 *   envelope: { app, version: 1, enc: true, exportedAt, salt, iv, ct }   ct = AES-GCM of the backup document
 * To read an old backup you need the PIN that was set when it was made.
 */
export const APP = 'team-management';

export const backupName = (date = toDateStr(new Date())) => `team-backup-${date}.json`;

const strip = (r) => { const { dirty, ...rest } = r; return rest; }; // eslint-disable-line no-unused-vars

export function buildBackup(username) {
  const s = getState();
  return {
    app: APP, version: 1, exportedAt: new Date().toISOString(), username,
    members: liveMembers(s).map(strip),
    leaves: liveLeaves(s).map(strip),
    allocations: liveAllocations(s).map(strip),
    notes: liveNotes(s).map(strip),
    holidays: liveHolidays(s).map(strip),
  };
}

export const hasData = () => {
  const s = getState();
  return liveMembers(s).length > 0 || liveNotes(s).length > 0;
};

/** The envelope for the current data; null when no PIN is active (nothing to encrypt with). */
export async function encryptedBackup(username) {
  const sealed = await vault.encryptWithKey(buildBackup(username));
  if (!sealed) return null;
  return { app: APP, version: 1, enc: true, exportedAt: new Date().toISOString(), ...sealed };
}

export class BackupError extends Error {}

/** Decrypts an envelope with a PIN. Throws BackupError for a wrong PIN or a file that is not a backup. */
export async function decryptBackup(envelope, pin) {
  if (envelope?.app !== APP || !envelope.enc || !envelope.ct) throw new BackupError('This is not an encrypted Team Manager backup');
  let doc;
  try {
    doc = await decryptJson(await keyFromPin(pin, envelope.salt), envelope);
  } catch {
    throw new BackupError('Wrong PIN, or the file is damaged. Use the PIN that was set when this backup was made.');
  }
  if (doc?.app !== APP || doc.version !== 1) throw new BackupError('This backup is from an incompatible version');
  return doc;
}

export function summarize(doc) {
  return { members: doc.members?.length ?? 0, leaves: doc.leaves?.length ?? 0, allocations: doc.allocations?.length ?? 0, notes: doc.notes?.length ?? 0, holidays: doc.holidays?.length ?? 0 };
}

export function download(envelope, name = backupName()) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- the copies kept on the server ----------
let status = { working: false, last: null, error: null, files: [] };
const watchers = new Set();
const set = (patch) => { status = { ...status, ...patch }; watchers.forEach((w) => w()); };
export const useBackupStatus = () => useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb); }, () => status);

export async function refreshFiles() {
  try {
    const files = await api.get('/api/backup/files');
    set({ files, last: files[0]?.date ?? null, error: null });
    return files;
  } catch (e) {
    set({ error: e.message });
    return status.files;
  }
}

/** Encrypt and upload today's backup (replaces today's file). Returns false when there is nothing to do. */
export async function uploadBackup(username) {
  if (!hasData()) return false;
  set({ working: true, error: null });
  try {
    const env = await encryptedBackup(username);
    if (!env) return false;
    await api.put(`/api/backup/files/${toDateStr(new Date())}`, env);
    await refreshFiles();
    return true;
  } catch (e) {
    set({ error: e.message || 'Backup failed' });
    return false;
  } finally {
    set({ working: false });
  }
}

export async function restoreDoc(doc, mode) {
  return api.post(`/api/backup/restore?mode=${mode}`, doc);
}

export const fetchServerBackup = (name) => api.get(`/api/backup/files/${name}`);

/** While unlocked with a PIN: make sure today's encrypted backup exists on the server. */
export function useDailyBackup(username, active) {
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    const check = async () => {
      if (stop || !navigator.onLine) return;
      const files = await refreshFiles();
      if (!stop && files[0]?.date !== toDateStr(new Date())) await uploadBackup(username);
    };
    const first = setTimeout(check, 8000); // let the first sync land before taking the backup
    const again = setInterval(check, 30 * 60_000);
    return () => { stop = true; clearTimeout(first); clearInterval(again); };
  }, [username, active]);
}
