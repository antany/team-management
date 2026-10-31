import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as vault from './db/vault';
import { clearState, flush, getState, loadState } from './db/store';
import { startSync, stopSync, flushNow, resetCursor } from './sync/engine';
import { useSession } from './session';
import { useSettings } from './db/settings';

/**
 * App lock. The local cache can be encrypted with a PIN; while locked the data is not in memory at all.
 *   - Reloading the page locks (the key only ever lives in memory).
 *   - No activity for `idleMinutes`, or the tab being hidden, sends you to Home and locks.
 *   - 5 wrong PINs sign you out and wipe this device's cache (the data stays on the server).
 */
const FAILS_KEY = 'team.pinfails';
export const MAX_FAILS = 5;

const Ctx = createContext(null);
export const useLock = () => useContext(Ctx);

const fails = () => Number(localStorage.getItem(FAILS_KEY) ?? 0) || 0;
const setFails = (n) => {
  try { n ? localStorage.setItem(FAILS_KEY, String(n)) : localStorage.removeItem(FAILS_KEY); } catch { /* storage blocked */ }
};

export function LockProvider({ children }) {
  const { me, signOut, refresh } = useSession();
  const nav = useNavigate();
  const settings = useSettings();
  const [phase, setPhase] = useState('loading'); // loading | locked | open
  const [hasPin, setHasPin] = useState(false);
  const [failed, setFailed] = useState(fails());
  const lastActive = useRef(Date.now());

  // Decide what to show whenever the signed-in account changes.
  useEffect(() => {
    stopSync();
    clearState();
    if (!me) {
      setPhase('open');
      return;
    }
    const owner = vault.owner();
    if (owner && owner !== me.id) vault.wipe(); // another account's cache: never mix them
    if (!vault.owner()) vault.setOwner(me.id);
    const kind = vault.kind();
    setHasPin(kind === 'encrypted');
    if (kind === 'encrypted') {
      vault.setLocked(true);
      setPhase('locked');
    } else {
      vault.setLocked(false);
      loadState(vault.readPlain() ?? {});
      setPhase('open');
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync only while signed in and unlocked.
  useEffect(() => {
    if (me && phase === 'open') startSync({ unauthorized: refresh });
    return stopSync;
  }, [me?.id, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const wipeAndSignOut = useCallback(async () => {
    stopSync();
    vault.wipe();
    clearState();
    setFails(0);
    setFailed(0);
    setHasPin(false);
    await signOut();
  }, [signOut]);

  const unlock = useCallback(async (pin) => {
    const data = await vault.unlock(pin);
    if (!data) {
      const n = fails() + 1;
      setFails(n);
      setFailed(n);
      if (n >= MAX_FAILS) await wipeAndSignOut();
      return false;
    }
    setFails(0);
    setFailed(0);
    loadState(data);
    setPhase('open');
    lastActive.current = Date.now();
    return true;
  }, [wipeAndSignOut]);

  const lockNow = useCallback(async ({ home = true } = {}) => {
    if (home) nav('/home', { replace: true });
    if (!hasPin || phase !== 'open') return;
    stopSync();
    await flush();
    vault.setLocked(true);
    clearState();
    setPhase('locked');
  }, [hasPin, phase, nav]);

  const setPin = useCallback(async (pin) => {
    await vault.setPin(pin, getState());
    setHasPin(true);
  }, []);

  const removePin = useCallback(async () => {
    await vault.removePin(getState());
    setHasPin(false);
  }, []);

  /** Explicit sign out: push what is pending, then wipe this device. Returns false if the user should confirm. */
  const signOutNow = useCallback(async ({ force = false } = {}) => {
    if (!force && !(await flushNow())) return false;
    await wipeAndSignOut();
    return true;
  }, [wipeAndSignOut]);

  // Idle and hidden detection.
  useEffect(() => {
    if (!me || phase !== 'open') return undefined;
    const touch = () => { lastActive.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = setInterval(() => {
      if (settings.idleMinutes > 0 && Date.now() - lastActive.current > settings.idleMinutes * 60_000) {
        lastActive.current = Date.now();
        lockNow();
      }
    }, 5_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden' && settings.lockOnHide) lockNow();
      else if (document.visibilityState === 'visible') touch();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [me?.id, phase, settings.idleMinutes, settings.lockOnHide, lockNow]);

  const value = useMemo(() => ({
    phase, hasPin, failed, unlock, lockNow, setPin, removePin, signOutNow, wipeAndSignOut, resetCursor,
  }), [phase, hasPin, failed, unlock, lockNow, setPin, removePin, signOutNow, wipeAndSignOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
