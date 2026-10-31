import { cryptoAvailable, decryptJson, encryptJson, keyFromPin, newSalt } from '../crypto';

/**
 * Persistence of the local cache in localStorage ("team.data"). Two shapes:
 *   { v: 1, enc: false, data }              no PIN set: plain JSON
 *   { v: 1, enc: true, salt, iv, ct }       PIN set: AES-GCM, key derived from the PIN (kept only in memory)
 * "team.owner" records which account the cache belongs to.
 */
const DATA = 'team.data';
const OWNER = 'team.owner';

let key = null;   // CryptoKey while unlocked with a PIN
let salt = null;
let writing = Promise.resolve();
let locked = false; // while locked nothing may be written: the in-memory state is empty

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(DATA));
  } catch {
    return null;
  }
};
const write = (envelope) => {
  try { localStorage.setItem(DATA, JSON.stringify(envelope)); } catch { /* storage blocked or full */ }
};

export const owner = () => localStorage.getItem(OWNER);
export const setOwner = (id) => { try { localStorage.setItem(OWNER, id); } catch { /* storage blocked */ } };

/** 'none' (no cache yet), 'plain' or 'encrypted'. */
export function kind() {
  const e = read();
  if (!e) return 'none';
  return e.enc ? 'encrypted' : 'plain';
}

export const readPlain = () => read()?.data ?? null;

/** Returns the decrypted state, or null when the PIN is wrong. */
export async function unlock(pin) {
  const e = read();
  try {
    const k = await keyFromPin(pin, e.salt);
    const data = await decryptJson(k, e);
    key = k;
    salt = e.salt;
    locked = false;
    return data;
  } catch {
    return null;
  }
}

/** Saves the state (debounced by the caller). Encrypts when a PIN is active; calls are serialised. */
export function save(state) {
  if (locked) return writing;
  const snapshot = JSON.parse(JSON.stringify(state));
  writing = writing.then(async () => {
    if (key) write({ v: 1, enc: true, salt, ...(await encryptJson(key, snapshot)) });
    else write({ v: 1, enc: false, data: snapshot });
  }).catch(() => {});
  return writing;
}

/** Start encrypting with this PIN (or change it). Re-encrypts the cache straight away. */
export async function setPin(pin, state) {
  if (!cryptoAvailable()) throw new Error('This browser only allows encryption on https:// pages or localhost');
  salt = newSalt();
  key = await keyFromPin(pin, salt);
  await save(state);
}

export async function removePin(state) {
  key = null;
  salt = null;
  await save(state);
}

/** Lock: forget the key (the data on disk stays encrypted) and refuse writes until unlocked. */
export function setLocked(value) {
  locked = value;
  if (value) key = null;
}

export const hasKey = () => !!key;

/** Encrypts with the PIN-derived key (for backups). Null when no PIN is active. */
export async function encryptWithKey(value) {
  if (!key) return null;
  return { salt, ...(await encryptJson(key, value)) };
}

export function wipe() {
  locked = false;
  key = null;
  salt = null;
  try {
    localStorage.removeItem(DATA);
    localStorage.removeItem(OWNER);
    localStorage.removeItem('team.sync');
    localStorage.removeItem('team.pinfails');
  } catch { /* storage blocked */ }
}
